import { SupabaseClient } from "@supabase/supabase-js";
import { slugify } from "@/lib/utils";

export async function handleListTopics(
  supabase: SupabaseClient,
  input: { search?: string; limit?: number; offset?: number }
) {
  const limit = Math.min(input.limit || 20, 50);
  const offset = input.offset || 0;

  let query = supabase
    .from("topics")
    .select("id, question, slug, category, summary, created_at, updated_at")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (input.search) {
    query = supabase
      .from("topics")
      .select("id, question, slug, category, summary, created_at, updated_at")
      .textSearch("fts", input.search.split(/\s+/).join(" & "), {
        type: "plain",
      })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
  }

  const { data, error } = await query;

  if (error && input.search) {
    // Fallback to ilike
    const { data: fallback } = await supabase
      .from("topics")
      .select("id, question, slug, category, summary, created_at, updated_at")
      .ilike("question", `%${input.search}%`)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    return { topics: fallback || [], count: fallback?.length || 0 };
  }

  // Get total count
  let countQuery = supabase
    .from("topics")
    .select("id", { count: "exact", head: true });
  if (input.search) {
    countQuery = countQuery.textSearch("fts", input.search.split(/\s+/).join(" & "), {
      type: "plain",
    });
  }
  const { count } = await countQuery;

  return { topics: data || [], total: count || 0, offset, limit };
}

export async function handleGetTopic(
  supabase: SupabaseClient,
  input: { id?: string; slug?: string }
) {
  let query = supabase
    .from("topics")
    .select("*")
    .single();

  if (input.id) {
    query = supabase.from("topics").select("*").eq("id", input.id).single();
  } else if (input.slug) {
    query = supabase.from("topics").select("*").eq("slug", input.slug).single();
  } else {
    return { error: "Provide either id or slug" };
  }

  const { data: topic, error } = await query;
  if (error) return { error: error.message };

  const { data: args } = await supabase
    .from("arguments")
    .select("id, position, summary, created_at")
    .eq("topic_id", topic.id)
    .order("created_at", { ascending: true });

  return { topic, arguments: args || [] };
}

export async function handleUpdateTopic(
  supabase: SupabaseClient,
  input: {
    id: string;
    question?: string;
    category?: 1 | 2 | 3;
    summary?: string;
    llm_perspective?: string;
  }
) {
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (input.question !== undefined) updates.question = input.question;
  if (input.category !== undefined) updates.category = input.category;
  if (input.summary !== undefined) updates.summary = input.summary;
  if (input.llm_perspective !== undefined)
    updates.llm_perspective = input.llm_perspective;

  const { data, error } = await supabase
    .from("topics")
    .update(updates)
    .eq("id", input.id)
    .select("id, question, slug, category, summary")
    .single();

  if (error) return { error: error.message };
  return { topic: data, updated_fields: Object.keys(updates).filter(k => k !== "updated_at") };
}

export async function handleDeleteTopic(
  supabase: SupabaseClient,
  input: { id: string }
) {
  // Get topic info before deleting
  const { data: topic } = await supabase
    .from("topics")
    .select("id, question, slug")
    .eq("id", input.id)
    .single();

  if (!topic) return { error: "Topic not found" };

  const { error } = await supabase
    .from("topics")
    .delete()
    .eq("id", input.id);

  if (error) return { error: error.message };
  return { deleted: true, topic };
}

export async function handleCreateTopic(
  supabase: SupabaseClient,
  input: {
    question: string;
    category: 1 | 2 | 3;
    summary?: string;
    llm_perspective?: string;
    arguments_for?: string[];
    arguments_against?: string[];
  }
) {
  const slug = slugify(input.question) + "-" + Date.now().toString(36);

  const { data: topic, error } = await supabase
    .from("topics")
    .insert({
      question: input.question,
      slug,
      category: input.category,
      summary: input.summary || null,
      llm_perspective: input.llm_perspective || null,
    })
    .select("id, question, slug, category")
    .single();

  if (error) return { error: error.message };

  // Create arguments if provided
  const args = [
    ...(input.arguments_for || []).map((s) => ({
      topic_id: topic.id,
      position: "for" as const,
      summary: s,
    })),
    ...(input.arguments_against || []).map((s) => ({
      topic_id: topic.id,
      position: "against" as const,
      summary: s,
    })),
  ];

  if (args.length > 0) {
    await supabase.from("arguments").insert(args);
  }

  return { topic, arguments_created: args.length };
}

export async function handleUpdateArgument(
  supabase: SupabaseClient,
  input: { id: string; summary?: string; position?: "for" | "against" }
) {
  const updates: Record<string, unknown> = {};
  if (input.summary !== undefined) updates.summary = input.summary;
  if (input.position !== undefined) updates.position = input.position;

  const { data, error } = await supabase
    .from("arguments")
    .update(updates)
    .eq("id", input.id)
    .select("id, topic_id, position, summary")
    .single();

  if (error) return { error: error.message };
  return { argument: data };
}

export async function handleDeleteArgument(
  supabase: SupabaseClient,
  input: { id: string }
) {
  const { data: arg } = await supabase
    .from("arguments")
    .select("id, summary, position")
    .eq("id", input.id)
    .single();

  if (!arg) return { error: "Argument not found" };

  const { error } = await supabase
    .from("arguments")
    .delete()
    .eq("id", input.id);

  if (error) return { error: error.message };
  return { deleted: true, argument: arg };
}

export async function handleCreateArgument(
  supabase: SupabaseClient,
  input: { topic_id: string; position: "for" | "against"; summary: string }
) {
  const { data, error } = await supabase
    .from("arguments")
    .insert({
      topic_id: input.topic_id,
      position: input.position,
      summary: input.summary,
    })
    .select("id, topic_id, position, summary")
    .single();

  if (error) return { error: error.message };
  return { argument: data };
}

export async function handleGetStats(supabase: SupabaseClient) {
  const [
    { count: totalTopics },
    { count: totalArguments },
    { data: categoryBreakdown },
  ] = await Promise.all([
    supabase.from("topics").select("id", { count: "exact", head: true }),
    supabase.from("arguments").select("id", { count: "exact", head: true }),
    supabase.rpc("get_category_counts").then((res) => {
      // Fallback if RPC doesn't exist
      if (res.error) {
        return { data: null };
      }
      return res;
    }),
  ]);

  // Manual category count if RPC not available
  let categories = categoryBreakdown;
  if (!categories) {
    const counts = await Promise.all(
      [1, 2, 3].map(async (cat) => {
        const { count } = await supabase
          .from("topics")
          .select("id", { count: "exact", head: true })
          .eq("category", cat);
        return { category: cat, count: count || 0 };
      })
    );
    categories = counts;
  }

  return {
    total_topics: totalTopics || 0,
    total_arguments: totalArguments || 0,
    categories,
  };
}
