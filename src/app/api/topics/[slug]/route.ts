import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const supabase = await createClient();

  // Support lookup by ID when slug is a UUID
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);
  const { data: topic, error } = await supabase
    .from("topics")
    .select("*")
    .eq(isUuid ? "id" : "slug", slug)
    .single();

  if (error || !topic) {
    return NextResponse.json({ error: "Topic not found" }, { status: 404 });
  }

  const { data: args } = await supabase
    .from("arguments")
    .select("*")
    .eq("topic_id", topic.id)
    .order("created_at", { ascending: true });

  const { data: conversations } = await supabase
    .from("conversations")
    .select("id, messages, created_at")
    .eq("topic_id", topic.id)
    .order("created_at", { ascending: true });

  return NextResponse.json({
    topic,
    arguments: args || [],
    conversations: conversations || [],
  });
}
