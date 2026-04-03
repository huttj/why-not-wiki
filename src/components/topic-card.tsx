import Link from "next/link";
import { CategoryBadge } from "./category-badge";
import { timeAgo } from "@/lib/utils";
import type { Topic } from "@/lib/types";

export function TopicCard({ topic }: { topic: Topic }) {
  return (
    <Link
      href={`/topic/${topic.slug}`}
      className="block p-5 rounded-xl border border-gray-200 bg-white hover:border-indigo-200 hover:shadow-md transition group"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-gray-900 font-medium group-hover:text-indigo-600 transition leading-snug">
          {topic.question}
        </h3>
        <CategoryBadge category={topic.category} />
      </div>
      {topic.summary && (
        <p className="mt-2 text-sm text-gray-500 line-clamp-2">
          {topic.summary}
        </p>
      )}
      <p className="mt-3 text-xs text-gray-400">{timeAgo(topic.created_at)}</p>
    </Link>
  );
}
