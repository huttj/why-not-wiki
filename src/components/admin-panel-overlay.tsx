"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useMemo, useEffect } from "react";
import { useAdminPanel } from "./admin-panel-provider";
import { AdminPanel } from "./admin-panel";

export interface PageContext {
  page: string;
  topicSlug?: string;
  conversationId?: string;
  topicId?: string;
}

function usePageContext(): PageContext {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return useMemo(() => {
    // /topic/[slug]
    const topicMatch = pathname.match(/^\/topic\/([^/]+)$/);
    if (topicMatch) {
      return { page: "topic", topicSlug: topicMatch[1] };
    }

    // /conversation/[id]
    const convMatch = pathname.match(/^\/conversation\/([^/]+)$/);
    if (convMatch) {
      return { page: "conversation", conversationId: convMatch[1] };
    }

    // /ask?topicId=...
    if (pathname === "/ask") {
      const topicId = searchParams.get("topicId");
      return topicId
        ? { page: "ask", topicId }
        : { page: "ask" };
    }

    if (pathname === "/") {
      return { page: "home" };
    }

    return { page: pathname.replace(/^\//, "") || "home" };
  }, [pathname, searchParams]);
}

export function AdminPanelOverlay() {
  const { isOpen, close } = useAdminPanel();
  const pageContext = usePageContext();

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) close();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, close]);

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40 transition-opacity"
          onClick={close}
        />
      )}

      {/* Slide-out panel */}
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-lg bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Panel header */}
        <div className="border-b border-gray-200 px-4 py-3 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-sm font-bold text-gray-900">Admin Panel</h2>
            <PageContextBadge context={pageContext} />
          </div>
          <button
            onClick={close}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
            aria-label="Close admin panel"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Admin panel chat */}
        <div className="flex-1 min-h-0">
          <AdminPanel pageContext={pageContext} />
        </div>
      </div>
    </>
  );
}

function PageContextBadge({ context }: { context: PageContext }) {
  let label: string;
  switch (context.page) {
    case "topic":
      label = `Topic: ${context.topicSlug}`;
      break;
    case "conversation":
      label = `Conversation: ${context.conversationId?.slice(0, 8)}...`;
      break;
    case "ask":
      label = context.topicId ? `Discussing topic` : "Ask page";
      break;
    case "home":
      label = "Home page";
      break;
    default:
      label = context.page;
  }

  return (
    <span className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
      {label}
    </span>
  );
}
