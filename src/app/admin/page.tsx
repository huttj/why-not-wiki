import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
import { redirect } from "next/navigation";
import { AdminPanel } from "@/components/admin-panel";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login?redirect=/admin");
  }

  const admin = await isAdmin(supabase);
  if (!admin) {
    redirect("/");
  }

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      <div className="border-b border-gray-200 bg-white px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Admin Panel</h1>
            <p className="text-xs text-gray-500">
              Manage topics and arguments with the admin bot
            </p>
          </div>
          <span className="text-xs text-gray-400">{user.email}</span>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <AdminPanel />
      </div>
    </div>
  );
}
