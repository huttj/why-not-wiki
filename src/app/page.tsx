import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TopicCard } from "@/components/topic-card";
import { CATEGORIES } from "@/lib/types";
import type { Topic } from "@/lib/types";

export const revalidate = 60;

export default async function HomePage() {
  let topics: Topic[] = [];

  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("topics")
      .select("id, question, slug, category, summary, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(20);
    topics = (data as Topic[]) || [];
  } catch {
    // Supabase not configured yet — show empty state
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      {/* Hero */}
      <section className="text-center mb-16">
        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
          &ldquo;Why can&apos;t we just...?&rdquo;
        </h1>
        <p className="text-lg md:text-xl text-gray-500 max-w-2xl mx-auto mb-8">
          A public archive of naive questions about the world. Ask anything.
          An AI will discuss it with you, search for real answers, and categorize
          what we find.
        </p>

        <Link
          href="/ask"
          className="inline-flex px-6 py-3 rounded-xl bg-indigo-600 text-white font-medium text-lg hover:bg-indigo-700 transition shadow-lg shadow-indigo-200"
        >
          Ask a question →
        </Link>
      </section>

      {/* Categories explanation */}
      <section className="mb-16">
        <div className="grid md:grid-cols-3 gap-4">
          {([1, 2, 3] as const).map((cat) => {
            const info = CATEGORIES[cat];
            const descriptions: Record<number, string> = {
              1: "There's a known reason this doesn't work. But now you know why!",
              2: "Great minds think alike — someone's already building this.",
              3: "A genuinely novel and viable idea. Maybe you should build it?",
            };
            return (
              <div
                key={cat}
                className={`p-5 rounded-xl border ${info.color}`}
              >
                <div className="text-2xl mb-2">{info.emoji}</div>
                <h3 className="font-semibold mb-1">{info.label}</h3>
                <p className="text-sm opacity-80">{descriptions[cat]}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Topic list */}
      <section>
        <h2 className="text-2xl font-bold text-gray-900 mb-6">
          {topics.length > 0 ? "Recent questions" : "No questions yet"}
        </h2>

        {topics.length > 0 ? (
          <div className="space-y-3">
            {topics.map((topic) => (
              <TopicCard key={topic.id} topic={topic} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
            <p className="text-gray-400 text-lg mb-4">
              The archive is empty. Be the first to ask!
            </p>
            <Link
              href="/ask"
              className="inline-flex px-5 py-2.5 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition"
            >
              Ask a question
            </Link>
          </div>
        )}
      </section>

      {/* Footer */}
      <footer className="mt-20 pt-8 border-t border-gray-200 text-center text-sm text-gray-400">
        <p>
          WhyNot? — Every question is worth asking. Even the &ldquo;dumb&rdquo; ones.
        </p>
      </footer>
    </div>
  );
}
