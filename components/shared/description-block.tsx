"use client";

import { useMemo, useState } from "react";
import { renderPlainTextWithLinks, truncateText } from "@/lib/text-rendering";

export function DescriptionBlock({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? { text, truncated: false } : truncateText(text);
  const html = useMemo(() => renderPlainTextWithLinks(shown.text), [shown.text]);

  return (
    <div className="max-w-3xl rounded-2xl border border-line bg-surface p-4 text-sm text-cream/80">
      <p className="whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: html }} />
      {shown.truncated || expanded ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 text-xs font-bold text-osc-blue hover:underline"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      ) : null}
    </div>
  );
}
