"use client";

import { Suspense, useState } from "react";
import { Chat } from "@/components/chat";

export default function AskPage() {
  return (
    <Suspense fallback={null}>
      <AskPageContent />
    </Suspense>
  );
}

function AskPageContent() {
  const [question, setQuestion] = useState("");
  const [started, setStarted] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    setStarted(true);
  }

  if (started) {
    return (
      <div className="h-[calc(100vh-4rem)] flex flex-col">
        <Chat initialQuestion={question.trim()} />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-20">
      <h1 className="text-3xl font-bold text-gray-900 mb-2 text-center">
        Ask a question
      </h1>
      <p className="text-gray-500 text-center mb-10">
        What&apos;s something you&apos;ve always wondered about? Start with &ldquo;Why
        can&apos;t we just...&rdquo;
      </p>

      <form onSubmit={handleSubmit}>
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Why can't we just..."
          rows={3}
          autoFocus
          className="w-full px-5 py-4 rounded-xl border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition text-lg text-gray-900 resize-none"
        />
        <button
          type="submit"
          disabled={!question.trim()}
          className="mt-4 w-full py-3.5 rounded-xl bg-indigo-600 text-white font-medium text-lg hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-200"
        >
          Start discussing →
        </button>
      </form>

      <div className="mt-10 text-sm text-gray-400 text-center">
        <p>
          Your conversation will be public. The archive grows with every
          question.
        </p>
      </div>
    </div>
  );
}
