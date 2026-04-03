"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface StatusMessage {
  type: "status";
  message: string;
}

interface ErrorMessage {
  type: "error";
  message: string;
}

type DisplayItem = ChatMessage | StatusMessage | ErrorMessage;

function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      components={{
        p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
        strong: ({ children }) => (
          <strong className="font-semibold">{children}</strong>
        ),
        ul: ({ children }) => (
          <ul className="list-disc list-inside mb-3 last:mb-0 space-y-1">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal list-inside mb-3 last:mb-0 space-y-1">
            {children}
          </ol>
        ),
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        h3: ({ children }) => (
          <h3 className="font-semibold text-base mb-2 mt-3 first:mt-0">
            {children}
          </h3>
        ),
        h2: ({ children }) => (
          <h2 className="font-bold text-base mb-2 mt-3 first:mt-0">
            {children}
          </h2>
        ),
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
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-gray-300 pl-3 italic text-gray-600 mb-3 last:mb-0">
            {children}
          </blockquote>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

export function Chat({
  initialQuestion,
  conversationId: initialConversationId,
  existingMessages,
}: {
  initialQuestion?: string;
  conversationId?: string;
  existingMessages?: ChatMessage[];
}) {
  const [messages, setMessages] = useState<DisplayItem[]>(
    existingMessages || []
  );
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationId, setConversationId] = useState(initialConversationId);
  const [categorizedTopic, setCategorizedTopic] = useState<{
    slug: string;
    question: string;
    category: number;
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const startedRef = useRef(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Start conversation on mount if we have an initial question
  useEffect(() => {
    if (initialQuestion && !startedRef.current) {
      startedRef.current = true;
      startConversation(initialQuestion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuestion]);

  async function startConversation(question: string) {
    setIsStreaming(true);
    setMessages([{ role: "user", content: question }]);

    try {
      const res = await fetch("/api/conversation/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to start conversation");
      }

      await processStream(res, question);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Sorry, something went wrong: ${err instanceof Error ? err.message : "Unknown error"}`,
        },
      ]);
    } finally {
      setIsStreaming(false);
    }
  }

  async function sendReply() {
    if (!input.trim() || !conversationId || isStreaming) return;

    const userMessage = input.trim();
    setInput("");
    setIsStreaming(true);
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);

    try {
      const res = await fetch("/api/conversation/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: conversationId,
          message: userMessage,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to send reply");
      }

      await processStream(res);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Sorry, something went wrong: ${err instanceof Error ? err.message : "Unknown error"}`,
        },
      ]);
    } finally {
      setIsStreaming(false);
    }
  }

  async function processStream(
    res: Response,
    initialQuestion?: string
  ) {
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
        const jsonStr = line.slice(6);

        try {
          const data = JSON.parse(jsonStr);

          if (data.type === "text") {
            if (needsNewMessage) {
              // Start a new assistant message
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
              const lastAssistant = updated.findLastIndex(
                (m) => "role" in m && m.role === "assistant"
              );
              if (lastAssistant >= 0) {
                updated[lastAssistant] = {
                  role: "assistant",
                  content: assistantText,
                };
              }
              return updated;
            });
          } else if (data.type === "text_end") {
            // Tool call is about to happen — finalize current text block
            needsNewMessage = true;
          } else if (data.type === "status") {
            setMessages((prev) => [
              ...prev,
              { type: "status", message: data.message },
            ]);
          } else if (data.type === "categorized") {
            setCategorizedTopic(data.topic);
          } else if (data.type === "done") {
            if (data.conversation_id) {
              setConversationId(data.conversation_id);
            }
          } else if (data.type === "error") {
            setMessages((prev) => {
              // Remove trailing empty assistant message left by stream setup
              const filtered = prev.filter(
                (m, idx) =>
                  !(
                    idx === prev.length - 1 &&
                    "role" in m &&
                    m.role === "assistant" &&
                    m.content === ""
                  )
              );
              return [...filtered, { type: "error", message: data.message }];
            });
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendReply();
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {messages.map((item, i) => {
          if ("type" in item && item.type === "status") {
            return (
              <div key={i} className="flex justify-center">
                <span className="text-xs text-gray-400 bg-gray-50 px-3 py-1 rounded-full">
                  {item.message}
                </span>
              </div>
            );
          }

          if ("type" in item && item.type === "error") {
            return (
              <div key={i} className="flex justify-start">
                <div className="max-w-[85%] md:max-w-[70%] px-4 py-3 rounded-2xl rounded-bl-md bg-red-50 border border-red-200">
                  <div className="flex items-start gap-2">
                    <span className="text-red-500 mt-0.5 shrink-0">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
                      </svg>
                    </span>
                    <p className="text-sm text-red-700">{item.message}</p>
                  </div>
                </div>
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
                className={`max-w-[85%] md:max-w-[70%] px-4 py-3 rounded-2xl ${
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

        {categorizedTopic && (
          <div className="flex justify-center">
            <button
              onClick={() =>
                router.push(`/topic/${categorizedTopic.slug}`)
              }
              className="px-4 py-3 rounded-xl bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 transition text-sm"
            >
              <span className="font-medium text-indigo-700">
                Topic created!
              </span>{" "}
              <span className="text-indigo-600 underline">
                View &quot;{categorizedTopic.question}&quot; →
              </span>
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      {conversationId && (
        <div className="border-t border-gray-200 bg-white px-4 py-3">
          <div className="max-w-3xl mx-auto flex gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Continue the discussion..."
              rows={1}
              disabled={isStreaming}
              className="flex-1 resize-none px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition text-sm text-gray-900 disabled:opacity-50"
            />
            <button
              onClick={sendReply}
              disabled={isStreaming || !input.trim()}
              className="px-4 py-3 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
