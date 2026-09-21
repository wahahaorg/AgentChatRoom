'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { AgentConfig } from '@/lib/types/agents';

interface MentionDropdownProps {
  agents: AgentConfig[];
  onSelect: (agent: AgentConfig) => void;
  position: { top: number; left: number };
}

export function MentionDropdown({ agents, onSelect, position }: MentionDropdownProps) {
  const [highlightIndex, setHighlightIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHighlightIndex(0);
  }, [agents]);

  useEffect(() => {
    const el = containerRef.current?.children[highlightIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlightIndex]);

  if (agents.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="absolute z-50 max-h-44 w-64 overflow-y-auto rounded-lg border bg-background p-1 shadow-lg"
      style={{ top: position.top, left: position.left }}
      role="listbox"
    >
      {agents.map((agent, i) => (
        <button
          key={agent.id}
          type="button"
          role="option"
          aria-selected={i === highlightIndex}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(agent);
          }}
          onMouseEnter={() => setHighlightIndex(i)}
          className={cn(
            'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
            i === highlightIndex ? 'bg-muted' : 'hover:bg-muted',
          )}
        >
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] text-white"
            style={{ backgroundColor: agent.colour }}
          >
            {agent.avatar}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">@{agent.name}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
