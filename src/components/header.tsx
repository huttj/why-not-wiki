"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

export function Header() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUser(data.user));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <header className="border-b border-gray-100 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-xl font-bold text-gray-900">
            Why<span className="text-indigo-600">Not</span>?
          </span>
        </Link>

        <nav className="flex items-center gap-4">
          {user ? (
            <>
              <Link
                href="/ask"
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition"
              >
                Ask a question
              </Link>
              <form action="/auth/signout" method="POST">
                <button
                  type="submit"
                  className="text-sm text-gray-500 hover:text-gray-700 transition"
                >
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <Link
              href="/auth/login"
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition"
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
