import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sort = searchParams.get("sort") || "recent";
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
  const offset = parseInt(searchParams.get("offset") || "0");

  const supabase = await createClient();

  let query = supabase
    .from("topics")
    .select("id, question, slug, category, summary, created_at, updated_at")
    .range(offset, offset + limit - 1);

  if (sort === "recent") {
    query = query.order("created_at", { ascending: false });
  } else {
    query = query.order("updated_at", { ascending: false });
  }

  const { data: topics, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ topics: topics || [] });
}
