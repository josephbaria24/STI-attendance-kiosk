"use client";

import { useId, useState } from "react";

export function ExpandableText({
  text,
  lines = 2,
  className = "",
}: {
  text: string;
  lines?: number;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();

  if (!text.trim()) return null;

  return (
    <div className={className}>
      <div
        className={`overflow-hidden transition-[max-height] duration-300 ease-in-out ${
          expanded ? "max-h-96" : "max-h-9"
        }`}
      >
        <p
          id={id}
          className={`text-[11px] font-normal leading-[1.125rem] text-slate-500 ${
            expanded ? "" : "line-clamp-2"
          }`}
        >
          {text}
        </p>
      </div>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={id}
        onClick={() => setExpanded((v) => !v)}
        className="mt-1 cursor-pointer text-[11px] font-bold text-[var(--primary)] transition hover:underline"
      >
        {expanded ? "See less" : "See more"}
      </button>
    </div>
  );
}
