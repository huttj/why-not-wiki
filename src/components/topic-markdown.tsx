"use client";

import ReactMarkdown from "react-markdown";

export function TopicMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      components={{
        p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
        strong: ({ children }) => (
          <strong className="font-semibold">{children}</strong>
        ),
        ul: ({ children }) => (
          <ul className="list-disc list-inside mb-3 last:mb-0 space-y-1">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal list-inside mb-3 last:mb-0 space-y-1">
            {children}
          </ol>
        ),
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        h3: ({ children }) => (
          <h3 className="font-semibold text-base mb-2 mt-4 first:mt-0">
            {children}
          </h3>
        ),
        h2: ({ children }) => (
          <h2 className="font-bold text-lg mb-2 mt-4 first:mt-0">
            {children}
          </h2>
        ),
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-600 underline hover:text-indigo-800"
          >
            {children}
          </a>
        ),
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-gray-300 pl-3 italic text-gray-600 mb-3 last:mb-0">
            {children}
          </blockquote>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
