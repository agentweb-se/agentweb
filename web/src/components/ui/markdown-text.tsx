"use client";

import React from "react";

/**
 * Lightweight markdown-to-React renderer. No external dependencies.
 * Handles: headers, bold, italic, links, lists, code blocks, inline code.
 */

type Props = {
  content: string;
  className?: string;
};

function parseInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Match: ![alt](url), **bold**, *italic*, [text](url), `code`, bare URLs
  const re =
    /(!\[([^\]]*)\]\((https?:\/\/[^)]+)\))|(\*\*(.+?)\*\*)|(\*(.+?)\*)|(\[([^\]]+)\]\((https?:\/\/[^)]+)\))|(`([^`]+)`)|(https?:\/\/[^\s<>)\]]+)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = re.exec(text)) !== null) {
    // Text before this match
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    if (match[1]) {
      // ![alt](url) — image
      nodes.push(
        <img
          key={key++}
          src={match[3]}
          alt={match[2] || ""}
          className="block max-w-[240px] max-h-[240px] rounded-lg object-contain my-2 bg-white/[0.03] border border-white/[0.06]"
          loading="lazy"
        />
      );
    } else if (match[4]) {
      // **bold** — recursively parse inner content for links etc.
      nodes.push(
        <strong key={key++} className="font-semibold text-neutral-300">
          {parseInline(match[5])}
        </strong>
      );
    } else if (match[6]) {
      // *italic* — recursively parse inner content
      nodes.push(
        <em key={key++} className="italic">
          {parseInline(match[7])}
        </em>
      );
    } else if (match[8]) {
      // [text](url)
      nodes.push(
        <a
          key={key++}
          href={match[10]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 hover:text-blue-300 underline underline-offset-2"
        >
          {match[9]}
        </a>
      );
    } else if (match[11]) {
      // `inline code`
      nodes.push(
        <code
          key={key++}
          className="px-1 py-0.5 rounded bg-white/[0.04] text-amber-400 text-[0.85em] font-mono"
        >
          {match[12]}
        </code>
      );
    } else if (match[13]) {
      // Bare URL
      nodes.push(
        <a
          key={key++}
          href={match[13]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 hover:text-blue-300 underline underline-offset-2 break-all"
        >
          {match[13]}
        </a>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

export function MarkdownText({ content, className }: Props) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let key = 0;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Empty line
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Headers
    if (line.startsWith("### ")) {
      elements.push(
        <h4 key={key++} className="text-sm font-semibold text-neutral-300 mt-3 mb-1">
          {parseInline(line.slice(4))}
        </h4>
      );
      i++;
      continue;
    }
    if (line.startsWith("## ")) {
      elements.push(
        <h3 key={key++} className="text-sm font-bold text-neutral-300 mt-3 mb-1.5">
          {parseInline(line.slice(3))}
        </h3>
      );
      i++;
      continue;
    }
    if (line.startsWith("# ")) {
      elements.push(
        <h2 key={key++} className="text-base font-bold text-neutral-300 mt-3 mb-1.5">
          {parseInline(line.slice(2))}
        </h2>
      );
      i++;
      continue;
    }

    // List items (- or numbered)
    if (/^(\s*[-*]\s|^\s*\d+\.\s)/.test(line)) {
      const listItems: React.ReactNode[] = [];
      while (i < lines.length && /^(\s*[-*]\s|^\s*\d+\.\s)/.test(lines[i])) {
        const itemText = lines[i].replace(/^\s*[-*]\s+|^\s*\d+\.\s+/, "");
        listItems.push(
          <li key={key++} className="ml-4 text-sm text-neutral-400 leading-relaxed">
            {parseInline(itemText)}
          </li>
        );
        i++;
      }
      elements.push(
        <ul key={key++} className="list-disc list-outside my-1 space-y-0.5">
          {listItems}
        </ul>
      );
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={key++} className="text-sm text-neutral-400 leading-relaxed my-1">
        {parseInline(line)}
      </p>
    );
    i++;
  }

  return <div className={className}>{elements}</div>;
}
