import { SupabaseClient } from "@supabase/supabase-js";
import { slugify } from "@/lib/utils";

export async function handleSearchArchive(
  supabase: SupabaseClient,
  query: string
) {
  const { data: topics, error } = await supabase
    .from("topics")
    .select("id, question, slug, category, summary")
    .textSearch("fts", query.split(/\s+/).join(" & "), { type: "plain" })
    .limit(5);

  if (error || !topics?.length) {
    // Fallback to ilike search
    const { data: fallback } = await supabase
      .from("topics")
      .select("id, question, slug, category, summary")
      .ilike("question", `%${query}%`)
      .limit(5);

    return fallback || [];
  }

  return topics;
}

export async function handleCategorizeTopic(
  supabase: SupabaseClient,
  input: {
    question: string;
    category: 1 | 2 | 3;
    reasoning: string;
    arguments_for: string[];
    arguments_against: string[];
    is_new_topic: boolean;
    existing_topic_id?: string;
    conversation_id: string;
  }
) {
  let topicId: string;

  if (input.is_new_topic) {
    const slug = slugify(input.question) + "-" + Date.now().toString(36);
    const { data: topic, error } = await supabase
      .from("topics")
      .insert({
        question: input.question,
        slug,
        category: input.category,
        summary: input.reasoning,
        llm_perspective: input.reasoning,
      })
      .select("id")
      .single();

    if (error) throw new Error(`Failed to create topic: ${error.message}`);
    topicId = topic.id;
  } else {
    topicId = input.existing_topic_id!;
    await supabase
      .from("topics")
      .update({
        category: input.category,
        summary: input.reasoning,
        llm_perspective: input.reasoning,
        updated_at: new Date().toISOString(),
      })
      .eq("id", topicId);
  }

  // Link conversation to topic
  await supabase
    .from("conversations")
    .update({ topic_id: topicId })
    .eq("id", input.conversation_id);

  // Create argument records
  const args = [
    ...input.arguments_for.map((s) => ({
      topic_id: topicId,
      conversation_id: input.conversation_id,
      position: "for" as const,
      summary: s,
    })),
    ...input.arguments_against.map((s) => ({
      topic_id: topicId,
      conversation_id: input.conversation_id,
      position: "against" as const,
      summary: s,
    })),
  ];

  if (args.length > 0) {
    await supabase.from("arguments").insert(args);
  }

  // Fetch the topic to return
  const { data: finalTopic } = await supabase
    .from("topics")
    .select("id, slug, question, category")
    .eq("id", topicId)
    .single();

  return finalTopic;
}
