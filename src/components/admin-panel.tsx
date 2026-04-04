"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ToolCallEvent {
  type: "tool_call";
  name: string;
}

interface ToolCallGroup {
  type: "tool_call_group";
  name: string;
  count: number;
}

type DisplayItem = ChatMessage | ToolCallEvent;
type GroupedDisplayItem = ChatMessage | ToolCallGroup;

const TOOL_LABELS: Record<string, string> = {
  list_topics: "Listing topics",
  get_topic: "Getting topic details",
  update_topic: "Updating topic",
  delete_topic: "Deleting topic",
  create_topic: "Creating topic",
  update_argument: "Updating argument",
  delete_argument: "Deleting argument",
  create_argument: "Creating argument",
  get_stats: "Getting stats",
};

function groupDisplayItems(items: DisplayItem[]): GroupedDisplayItem[] {
  const result: GroupedDisplayItem[] = [];
  for (const item of items) {
    if ("type" in item && item.type === "tool_call") {
      const last = result[result.length - 1];
      if (last && "type" in last && last.type === "tool_call_group" && last.name === item.name) {
        last.count++;
      } else {
        result.push({ type: "tool_call_group", name: item.name, count: 1 });
      }
    } else {
      result.push(item as ChatMessage);
    }
  }
  return result;
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        strong: ({ children }) => (
          <strong className="font-semibold">{children}</strong>
        ),
        ul: ({ children }) => (
          <ul className="list-disc list-inside mb-2 last:mb-0 space-y-0.5">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal list-inside mb-2 last:mb-0 space-y-0.5">
            {children}
          </ol>
        ),
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        h3: ({ children }) => (
          <h3 className="font-semibold text-sm mb-1.5 mt-2 first:mt-0">
            {children}
          </h3>
        ),
        h2: ({ children }) => (
          <h2 className="font-bold text-sm mb-1.5 mt-2 first:mt-0">
            {children}
          </h2>
        ),
        code: ({ children, className }) => {
          const isBlock = className?.includes("language-");
          if (isBlock) {
            return (
              <pre className="bg-gray-800 text-gray-100 rounded-lg p-3 mb-2 overflow-x-auto text-xs">
                <code>{children}</code>
              </pre>
            );
          }
          return (
            <code className="bg-gray-200 text-gray-800 rounded px-1 py-0.5 text-xs font-mono">
              {children}
            </code>
          );
        },
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-600 underline hover:text-indigo-800"
          >
            {children}
          </a>
        ),
        table: ({ children }) => (
          <div className="overflow-x-auto mb-2">
            <table className="min-w-full text-xs border border-gray-200 rounded">
              {children}
            </table>
          </div>
        ),
        th: ({ children }) => (
          <th className="px-2 py-1.5 bg-gray-100 text-left font-medium text-gray-700 border-b border-gray-200">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="px-2 py-1.5 border-b border-gray-100 text-gray-700">
            {children}
          </td>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

const QUICK_ACTIONS = [
  { label: "Show stats", prompt: "Show me archive statistics." },
  { label: "List all topics", prompt: "List all topics." },
  {
    label: "Recent topics",
    prompt: "Show me the 5 most recent topics with their arguments.",
  },
];

export function AdminPanel() {
  const [messages, setMessages] = useState<DisplayItem[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(
    async (messageText?: string) => {
      const text = (messageText || input).trim();
      if (!text || isStreaming) return;

      if (!messageText) setInput("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";

      const userMsg: ChatMessage = { role: "user", content: text };
      const newHistory = [...chatHistory, userMsg];

      setMessages((prev) => [...prev, userMsg]);
      setChatHistory(newHistory);
      setIsStreaming(true);

      try {
        const res = await fetch("/api/admin/bot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: newHistory }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Request failed");
        }

        const reader = res.body?.getReader();
        if (!reader) return;

        const decoder = new TextDecoder();
        let assistantText = "";
        let needsNewMessage = true;
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === "text") {
                if (needsNewMessage) {
                  assistantText = "";
                  setMessages((prev) => [
                    ...prev,
                    { role: "assistant", content: "" },
                  ]);
                  needsNewMessage = false;
                }
                assistantText += data.text;
                setMessages((prev) => {
                  const updated = [...prev];
                  const lastIdx = updated.findLastIndex(
                    (m) => "role" in m && m.role === "assistant"
                  );
                  if (lastIdx >= 0) {
                    updated[lastIdx] = {
                      role: "assistant",
                      content: assistantText,
                    };
                  }
                  return updated;
                });
              } else if (data.type === "text_end") {
                needsNewMessage = true;
              } else if (data.type === "tool_call") {
                setMessages((prev) => [
                  ...prev,
                  { type: "tool_call", name: data.name },
                ]);
              } else if (data.type === "done") {
                // Update chat history with full assistant response
                if (assistantText) {
                  setChatHistory((prev) => [
                    ...prev,
                    { role: "assistant", content: assistantText },
                  ]);
                }
              } else if (data.type === "error") {
                setMessages((prev) => [
                  ...prev,
                  {
                    role: "assistant",
                    content: `**Error:** ${data.message}`,
                  },
                ]);
              }
            } catch {
              // skip malformed JSON
            }
          }
        }
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `**Error:** ${err instanceof Error ? err.message : "Something went wrong"}`,
          },
        ]);
      } finally {
        setIsStreaming(false);
      }
    },
    [input, isStreaming, chatHistory]
  );

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <div className="h-full flex flex-col max-w-4xl mx-auto">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-16">
            <h2 className="text-xl font-semibold text-gray-700 mb-2">
              Admin Bot
            </h2>
            <p className="text-sm text-gray-400 mb-6">
              Ask me to manage topics and arguments. I can list, edit, create,
              and delete anything in the archive.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action.label}
                  onClick={() => sendMessage(action.prompt)}
                  className="px-3 py-1.5 text-xs rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition"
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {groupDisplayItems(messages).map((item, i) => {
          if ("type" in item && item.type === "tool_call_group") {
            const label = TOOL_LABELS[item.name] || item.name;
            return (
              <div key={i} className="flex justify-center">
                <span className="text-xs text-gray-400 bg-gray-50 px-3 py-1 rounded-full flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
                  {label}{item.count > 1 ? ` x${item.count}` : ""}
                </span>
              </div>
            );
          }

          const msg = item as ChatMessage;
          const isUser = msg.role === "user";

          return (
            <div
              key={i}
              className={`flex ${isUser ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] px-4 py-3 rounded-2xl ${
                  isUser
                    ? "bg-indigo-600 text-white rounded-br-md"
                    : "bg-gray-100 text-gray-900 rounded-bl-md"
                }`}
              >
                {isUser ? (
                  <div className="whitespace-pre-wrap text-sm leading-relaxed">
                    {msg.content}
                  </div>
                ) : (
                  <div className="text-sm leading-relaxed prose-sm">
                    {msg.content ? (
                      <MarkdownContent content={msg.content} />
                    ) : (
                      isStreaming && (
                        <span className="inline-block w-2 h-4 bg-gray-400 animate-pulse ml-0.5" />
                      )
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 bg-white px-4 py-3">
        <div className="flex gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              const ta = e.target;
              ta.style.height = "auto";
              ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
            }}
            onKeyDown={handleKeyDown}
            placeholder='Try "List all topics" or "Delete topic with id ..."'
            rows={1}
            disabled={isStreaming}
            className="flex-1 resize-none px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition text-sm text-gray-900 disabled:opacity-50"
          />
          <button
            onClick={() => sendMessage()}
            disabled={isStreaming || !input.trim()}
            className="px-4 py-3 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
