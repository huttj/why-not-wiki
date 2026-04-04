import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TopicMarkdown } from "@/components/topic-markdown";
import type { Message } from "@/lib/types";
import { timeAgo } from "@/lib/utils";

export const revalidate = 60;

function stripDomain(email: string): string {
  return email.split("@")[0];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();

  const { data: conv } = await supabase
    .from("conversations")
    .select("messages, topics(question)")
    .eq("id", id)
    .single();

  if (!conv) return {};

  const msgs = (conv.messages as Message[]) || [];
  const topicQuestion = (conv.topics as unknown as { question: string } | null)?.question;
  const preview = msgs[0]?.content?.slice(0, 100) || "Conversation";

  return {
    title: `${topicQuestion ? `${topicQuestion} — ` : ""}Conversation — WhyNot?`,
    description: preview,
  };
}

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: conv } = await supabase
    .from("conversations")
    .select("id, topic_id, user_id, messages, created_at, topics(question, slug)")
    .eq("id", id)
    .single();

  if (!conv) notFound();

  const msgs = (conv.messages as Message[]) || [];
  const topic = conv.topics as unknown as { question: string; slug: string } | null;

  // Try to get user email via admin client (bypasses RLS), fall back to anon client
  let userEmail: string | null = null;
  const admin = createAdminClient();
  if (admin) {
    const { data: user } = await admin
      .from("users")
      .select("email")
      .eq("id", conv.user_id)
      .single();
    userEmail = user?.email || null;
  }

  const displayName = userEmail ? stripDomain(userEmail) : "someone";

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      {/* Back link */}
      {topic && (
        <Link
          href={`/topic/${topic.slug}`}
          className="text-sm text-indigo-600 hover:text-indigo-800 mb-6 inline-block"
        >
          ← Back to &ldquo;{topic.question}&rdquo;
        </Link>
      )}

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Conversation</h1>
        <p className="text-sm text-gray-400">
          Started by <span className="text-gray-600 font-medium">{displayName}</span>
          {" · "}
          {timeAgo(conv.created_at)}
        </p>
      </div>

      {/* Messages */}
      <div className="space-y-4">
        {msgs.map((msg, i) => (
          <div
            key={i}
            className={`rounded-xl border p-4 ${
              msg.role === "user"
                ? "bg-indigo-50 border-indigo-100"
                : "bg-white border-gray-200"
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <span
                className={`text-xs font-semibold uppercase ${
                  msg.role === "user" ? "text-indigo-600" : "text-gray-400"
                }`}
              >
                {msg.role === "user" ? displayName : "WhyNot"}
              </span>
            </div>
            <div className="text-sm text-gray-700 leading-relaxed">
              <TopicMarkdown content={msg.content} />
            </div>
          </div>
        ))}
      </div>

      {/* Back to topic CTA */}
      {topic && (
        <div className="mt-8 text-center">
          <Link
            href={`/topic/${topic.slug}`}
            className="text-sm text-indigo-600 hover:text-indigo-800"
          >
            ← Back to topic
          </Link>
        </div>
      )}
    </div>
  );
}
