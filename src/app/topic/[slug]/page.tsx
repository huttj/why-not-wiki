import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { CategoryBadge } from "@/components/category-badge";
import { TopicMarkdown } from "@/components/topic-markdown";
import type { Topic, Argument, Conversation, Message } from "@/lib/types";
import { timeAgo } from "@/lib/utils";

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: topic } = await supabase
    .from("topics")
    .select("question, summary, slug")
    .eq("slug", slug)
    .single();

  if (!topic) {
    return {};
  }

  const title = `${topic.question} — WhyNot?`;
  const description =
    topic.summary ||
    "A naive question explored and categorized through conversation.";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "article",
      url: `/topic/${topic.slug}`,
      siteName: "WhyNot?",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}

export default async function TopicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  let topic: Topic | null = null;
  let args: Argument[] = [];
  let conversations: Array<
    Pick<Conversation, "id" | "messages" | "created_at">
  > = [];

  try {
    const supabase = await createClient();

    const { data: topicData } = await supabase
      .from("topics")
      .select("*")
      .eq("slug", slug)
      .single();

    if (!topicData) notFound();
    topic = topicData as Topic;

    const { data: argsData } = await supabase
      .from("arguments")
      .select("*")
      .eq("topic_id", topic.id)
      .order("created_at", { ascending: true });

    args = (argsData as Argument[]) || [];

    const { data: convsData } = await supabase
      .from("conversations")
      .select("id, messages, created_at")
      .eq("topic_id", topic.id)
      .order("created_at", { ascending: true });

    conversations = convsData || [];
  } catch {
    notFound();
  }

  if (!topic) notFound();

  const argsFor = args.filter((a) => a.position === "for");
  const argsAgainst = args.filter((a) => a.position === "against");

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      {/* Header */}
      <div className="mb-8">
        <CategoryBadge category={topic.category} size="lg" />
        <h1 className="text-3xl font-bold text-gray-900 mt-4 mb-2">
          {topic.question}
        </h1>
        <p className="text-sm text-gray-400">
          Asked {timeAgo(topic.created_at)} · Updated{" "}
          {timeAgo(topic.updated_at)}
        </p>
      </div>

      {/* LLM Perspective */}
      {topic.llm_perspective && (
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">
            Assessment
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="text-gray-700 leading-relaxed">
              <TopicMarkdown content={topic.llm_perspective} />
            </div>
          </div>
        </section>
      )}

      {/* Arguments */}
      {(argsFor.length > 0 || argsAgainst.length > 0) && (
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">
            Arguments
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            {argsFor.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-emerald-700 mb-2">
                  ✅ Why it could work
                </h3>
                <ul className="space-y-2">
                  {argsFor.map((arg) => (
                    <li
                      key={arg.id}
                      className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 text-sm text-gray-700"
                    >
                      {arg.summary}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {argsAgainst.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-red-700 mb-2">
                  ❌ Why it can&apos;t work
                </h3>
                <ul className="space-y-2">
                  {argsAgainst.map((arg) => (
                    <li
                      key={arg.id}
                      className="bg-red-50 border border-red-100 rounded-lg p-3 text-sm text-gray-700"
                    >
                      {arg.summary}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Conversations */}
      {conversations.length > 0 && (
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">
            Conversations ({conversations.length})
          </h2>
          <div className="space-y-4">
            {conversations.map((conv) => {
              const msgs = (conv.messages as Message[]) || [];
              return (
                <details
                  key={conv.id}
                  className="bg-white rounded-xl border border-gray-200 overflow-hidden group"
                >
                  <summary className="px-5 py-4 cursor-pointer hover:bg-gray-50 transition flex items-center justify-between">
                    <span className="text-sm text-gray-700">
                      {msgs[0]?.content?.slice(0, 100) || "Conversation"}
                      {(msgs[0]?.content?.length || 0) > 100 ? "..." : ""}
                    </span>
                    <span className="text-xs text-gray-400 ml-4 shrink-0">
                      {timeAgo(conv.created_at)}
                    </span>
                  </summary>
                  <div className="px-5 pb-4 space-y-3 border-t border-gray-100 pt-4">
                    {msgs.map((msg, i) => (
                      <div
                        key={i}
                        className={`text-sm ${msg.role === "user" ? "text-indigo-700 font-medium" : "text-gray-600"}`}
                      >
                        <span className="text-xs text-gray-400 uppercase mr-2">
                          {msg.role === "user" ? "Q:" : "A:"}
                        </span>
                        <span className="whitespace-pre-wrap">
                          {msg.content}
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              );
            })}
          </div>
        </section>
      )}

      {/* Discuss CTA */}
      <div className="text-center">
        <Link
          href={`/ask?topicId=${encodeURIComponent(topic.id)}`}
          className="inline-flex px-5 py-2.5 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition"
        >
          Discuss this topic →
        </Link>
      </div>
    </div>
  );
}
