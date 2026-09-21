'use client';

import { cn } from '@/lib/utils';

interface AgentErrorBlockProps {
  agentName: string;
  agentAvatar: string;
  agentColour?: string;
  error: string;
}

export function AgentErrorBlock({
  agentName,
  agentAvatar,
  agentColour,
  error,
}: AgentErrorBlockProps) {
  return (
    <div className="flex min-w-0 gap-3 py-4 justify-start">
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm text-white opacity-50"
        style={agentColour ? { backgroundColor: agentColour } : undefined}
      >
        {agentAvatar}
      </span>
      <div className="min-w-0 max-w-[92%] space-y-1">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium">{agentName}</span>
        </div>
        <div
          className={cn(
            'min-w-0 px-4 py-2.5 rounded-2xl border border-destructive/30 bg-destructive/10 text-sm text-destructive',
          )}
        >
          调用失败：{error}
        </div>
      </div>
    </div>
  );
}
