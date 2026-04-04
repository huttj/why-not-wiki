"use client";

import { useState, useRef, useEffect, useCallback } from "react";
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

interface Citation {
  url: string;
  title: string;
  page_age: string | null;
}

interface StatusGroup {
  type: "status_group";
  message: string;
  count: number;
}

type DisplayItem = ChatMessage | StatusMessage | ErrorMessage;
type GroupedDisplayItem = ChatMessage | StatusGroup | ErrorMessage;

interface WebSearchState {
  totalSearches: number;
  completedSearches: number;
  citations: Citation[];
}

function groupDisplayItems(items: DisplayItem[]): GroupedDisplayItem[] {
  const result: GroupedDisplayItem[] = [];
  for (const item of items) {
    if ("type" in item && item.type === "status") {
      const last = result[result.length - 1];
      if (last && "type" in last && last.type === "status_group" && last.message === item.message) {
        last.count++;
      } else {
        result.push({ type: "status_group", message: item.message, count: 1 });
      }
    } else {
      result.push(item as ChatMessage | ErrorMessage);
    }
  }
  return result;
}

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

function WebSearchSidebar({ webSearch }: { webSearch: WebSearchState }) {
  const isSearching = webSearch.completedSearches < webSearch.totalSearches;
  const count = webSearch.totalSearches;
  const label = isSearching
    ? `Searching the web${count > 1 ? ` x${count}` : ""}...`
    : `Searched the web${count > 1 ? ` x${count}` : ""}`;

  return (
    <div className="w-64 shrink-0 border-l border-gray-200 bg-gray-50/50 overflow-y-auto">
      <div className="px-4 py-4">
        <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
          {isSearching ? (
            <span className="inline-block w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin shrink-0" />
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 shrink-0 text-gray-400">
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.45 4.39l3.58 3.58a.75.75 0 1 1-1.06 1.06l-3.58-3.58A7 7 0 0 1 2 9Z" clipRule="evenodd" />
            </svg>
          )}
          <span className="font-medium">{label}</span>
        </div>
        {webSearch.citations.length > 0 && (
          <ul className="space-y-1">
            {webSearch.citations.map((c, i) => {
              let hostname = "";
              try {
                hostname = new URL(c.url).hostname.replace(/^www\./, "");
              } catch {
                hostname = c.url;
              }
              return (
                <li key={i}>
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition text-xs group/link"
                  >
                    <span className="text-gray-400 shrink-0 mt-0.5">{i + 1}.</span>
                    <span className="min-w-0">
                      <span className="text-gray-700 font-medium line-clamp-1 group-hover/link:text-indigo-600 transition">
                        {c.title || hostname}
                      </span>
                      <span className="text-gray-400 block truncate text-[11px]">
                        {hostname}
                        {c.page_age ? ` · ${c.page_age}` : ""}
                      </span>
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

interface TopicData {
  topic: {
    id: string;
    question: string;
    slug: string;
    category: 1 | 2 | 3;
    summary: string | null;
    llm_perspective: string | null;
    created_at: string;
    updated_at: string;
  };
  arguments: Array<{
    id: string;
    position: "for" | "against";
    summary: string;
  }>;
}

const CATEGORY_INFO: Record<number, { label: string; emoji: string; color: string }> = {
  1: { label: "Can't work", emoji: "\u274C", color: "bg-red-100 text-red-800 border-red-200" },
  2: { label: "Someone's on it", emoji: "\uD83D\uDC4D", color: "bg-amber-100 text-amber-800 border-amber-200" },
  3: { label: "Novel idea", emoji: "\u2705", color: "bg-emerald-100 text-emerald-800 border-emerald-200" },
};

function TopicPanelContent({ topicData }: { topicData: TopicData }) {
  const { topic } = topicData;
  const cat = CATEGORY_INFO[topic.category];
  const argsFor = topicData.arguments.filter((a) => a.position === "for");
  const argsAgainst = topicData.arguments.filter((a) => a.position === "against");

  return (
    <div className="px-4 py-4 space-y-4">
      {/* Category badge */}
      <span className={`inline-flex items-center gap-1.5 rounded-full border font-medium px-2.5 py-1 text-xs ${cat.color}`}>
        <span>{cat.emoji}</span>
        <span>{cat.label}</span>
      </span>

      {/* Question */}
      <h3 className="text-sm font-semibold text-gray-900 leading-snug">
        {topic.question}
      </h3>

      {/* Assessment */}
      {topic.llm_perspective && (
        <div>
          <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Assessment</h4>
          <div className="text-xs text-gray-700 leading-relaxed">
            <MarkdownContent content={topic.llm_perspective} />
          </div>
        </div>
      )}

      {/* Arguments */}
      {(argsFor.length > 0 || argsAgainst.length > 0) && (
        <div className="space-y-3">
          {argsFor.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-emerald-700 mb-1.5">Why it could work</h4>
              <ul className="space-y-1">
                {argsFor.map((arg) => (
                  <li key={arg.id} className="bg-emerald-50 border border-emerald-100 rounded-lg p-2 text-xs text-gray-700">
                    {arg.summary}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {argsAgainst.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-red-700 mb-1.5">Why it can&#39;t work</h4>
              <ul className="space-y-1">
                {argsAgainst.map((arg) => (
                  <li key={arg.id} className="bg-red-50 border border-red-100 rounded-lg p-2 text-xs text-gray-700">
                    {arg.summary}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Link to full topic */}
      <a
        href={`/topic/${topic.slug}`}
        className="block text-center text-xs text-indigo-600 hover:text-indigo-800 font-medium transition"
      >
        View full topic page →
      </a>
    </div>
  );
}

function TopicPopover({ topicData, open, onClose }: { topicData: TopicData; open: boolean; onClose: () => void }) {
  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      {/* Popover panel */}
      <div className="fixed inset-x-4 top-20 bottom-20 z-50 bg-white rounded-2xl shadow-xl overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900">Topic Details</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>
        <TopicPanelContent topicData={topicData} />
      </div>
    </>
  );
}

export function Chat({
  initialQuestion,
  conversationId: initialConversationId,
  existingMessages,
  topicId,
}: {
  initialQuestion?: string;
  conversationId?: string;
  existingMessages?: ChatMessage[];
  topicId?: string;
}) {
  const [messages, setMessages] = useState<DisplayItem[]>(
    existingMessages || []
  );
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [webSearch, setWebSearch] = useState<WebSearchState>({
    totalSearches: 0,
    completedSearches: 0,
    citations: [],
  });
  const [conversationId, setConversationId] = useState(initialConversationId);
  const [categorizedTopic, setCategorizedTopic] = useState<{
    slug: string;
    question: string;
    category: number;
  } | null>(null);
  const [topicData, setTopicData] = useState<TopicData | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const startedRef = useRef(false);

  const fetchTopicData = useCallback(async (slug: string) => {
    try {
      const res = await fetch(`/api/topics/${slug}`);
      if (res.ok) {
        const data = await res.json();
        setTopicData(data);
      }
    } catch {
      // Silently fail — topic panel is supplementary
    }
  }, []);

  // Fetch topic data when a topicId is provided
  useEffect(() => {
    if (topicId) {
      fetchTopicData(topicId);
    }
  }, [topicId, fetchTopicData]);

  // Fetch/refresh topic data when a topic is categorized
  useEffect(() => {
    if (categorizedTopic?.slug) {
      fetchTopicData(categorizedTopic.slug);
    }
  }, [categorizedTopic, fetchTopicData]);

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
    setWebSearch({ totalSearches: 0, completedSearches: 0, citations: [] });

    try {
      const res = await fetch("/api/conversation/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, ...(topicId ? { topic_id: topicId } : {}) }),
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
    if (!input.trim() || isStreaming) return;

    // If no conversation started yet (topic discussion), start one
    if (!conversationId) {
      const userMessage = input.trim();
      setInput("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
      startConversation(userMessage);
      return;
    }

    const userMessage = input.trim();
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setIsStreaming(true);
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setWebSearch({ totalSearches: 0, completedSearches: 0, citations: [] });

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
          } else if (data.type === "web_search_start") {
            setWebSearch((prev) => ({
              ...prev,
              totalSearches: prev.totalSearches + 1,
            }));
          } else if (data.type === "web_search_complete") {
            setWebSearch((prev) => ({
              ...prev,
              completedSearches: prev.completedSearches + 1,
              citations: [...prev.citations, ...(data.citations || [])],
            }));
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

  const hasTopicPanel = !!topicData;

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-1 min-h-0">
        {/* LEFT: Topic panel (desktop only) */}
        {hasTopicPanel && (
          <div className="hidden md:block md:w-1/2 border-r border-gray-200 bg-white overflow-y-auto">
            <TopicPanelContent topicData={topicData} />
          </div>
        )}

        {/* RIGHT (or full width): Chat area */}
        <div className={`flex flex-col ${hasTopicPanel ? "w-full md:w-1/2" : "flex-1"} min-w-0`}>
          {/* Mobile topic popover trigger */}
          {hasTopicPanel && (
            <div className="md:hidden border-b border-gray-200 bg-gray-50 px-4 py-2">
              <button
                onClick={() => setPopoverOpen(true)}
                className="text-xs text-indigo-600 font-medium flex items-center gap-1.5"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z" clipRule="evenodd" />
                </svg>
                View topic details
              </button>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto">
            <div className="flex min-h-0">
              <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
                {/* Show "Discussing" context at the top */}
                {topicId && topicData && (
                  <div className="flex justify-center">
                    <span className="text-xs text-gray-500 bg-indigo-50 border border-indigo-100 px-4 py-2 rounded-full">
                      Discussing: <span className="font-medium text-indigo-700">{topicData.topic.question}</span>
                    </span>
                  </div>
                )}

                {groupDisplayItems(messages).map((item, i) => {
                  if ("type" in item && item.type === "status_group") {
                    return (
                      <div key={i} className="flex justify-center">
                        <span className="text-xs text-gray-400 bg-gray-50 px-3 py-1 rounded-full">
                          {item.message}{item.count > 1 ? ` x${item.count}` : ""}
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

                <div ref={messagesEndRef} />
              </div>

              {/* Web search sidebar (only when no topic panel) */}
              {!hasTopicPanel && webSearch.totalSearches > 0 && (
                <WebSearchSidebar webSearch={webSearch} />
              )}
            </div>
          </div>

          {/* Input area */}
          {(conversationId || topicId) && (
            <div className="border-t border-gray-200 bg-white px-4 py-3">
              <div className="max-w-3xl mx-auto flex gap-2">
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
      </div>

      {/* Mobile topic popover */}
      {hasTopicPanel && (
        <TopicPopover topicData={topicData} open={popoverOpen} onClose={() => setPopoverOpen(false)} />
      )}
    </div>
  );
}
