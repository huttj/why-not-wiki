import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: topic, error } = await supabase
    .from("topics")
    .select("*")
    .eq("slug", slug)
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
