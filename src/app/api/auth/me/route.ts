import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ user: null, isAdmin: false });
  }

  // Use admin client to bypass RLS and avoid infinite recursion on users table
  const adminClient = createAdminClient();
  let isAdmin = false;

  if (adminClient) {
    const { data } = await adminClient
      .from("users")
      .select("is_admin")
      .eq("id", user.id)
      .single();
    isAdmin = data?.is_admin === true;
  }

  return NextResponse.json({ user: { id: user.id, email: user.email }, isAdmin });
}
