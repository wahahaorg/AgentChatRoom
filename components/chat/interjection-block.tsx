'use client';

import { memo } from 'react';
import { MarkdownRenderer } from './markdown-renderer';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

interface InterjectionBlockProps {
  agentName: string;
  agentRole: string;
  agentAvatar: string;
  agentColour?: string;
  content: string;
}

export const InterjectionBlock = memo(function InterjectionBlock({
  agentName,
  agentRole,
  agentAvatar,
  agentColour,
  content,
}: InterjectionBlockProps) {
  const { t } = useI18n();
  return (
    <div className="flex min-w-0 gap-3 py-4 justify-start">
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm text-white"
        style={agentColour ? { backgroundColor: agentColour } : undefined}
      >
        {agentAvatar}
      </span>
      <div className="min-w-0 max-w-[92%] space-y-1">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium">{agentName}</span>
          <span
            className="rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
            style={agentColour ? { borderColor: agentColour, color: agentColour } : undefined}
          >
            {t.interjection}
          </span>
          <span className="text-[11px]">{agentRole}</span>
        </div>
        <div
          className={cn(
            'min-w-0 px-4 py-2.5 shadow-sm rounded-2xl border border-border/60 border-l-4 bg-muted',
          )}
          style={agentColour ? { borderLeftColor: agentColour } : undefined}
        >
          <MarkdownRenderer content={content} />
        </div>
      </div>
    </div>
  );
});
