import { CATEGORIES } from "@/lib/types";

export function CategoryBadge({
  category,
  size = "sm",
}: {
  category: 1 | 2 | 3;
  size?: "sm" | "lg";
}) {
  const cat = CATEGORIES[category];

  const sizeClasses =
    size === "lg" ? "px-4 py-2 text-base" : "px-2.5 py-1 text-xs";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${cat.color} ${sizeClasses}`}
    >
      <span>{cat.emoji}</span>
      <span>{cat.label}</span>
    </span>
  );
}
