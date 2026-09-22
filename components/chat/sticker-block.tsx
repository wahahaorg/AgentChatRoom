'use client';

import { memo } from 'react';

interface StickerBlockProps {
  agentName: string;
  agentRole: string;
  agentAvatar?: string;
  agentColour?: string;
  emoji: string;
}

/** A standalone emoji sticker message sent by an agent (表情包 style). */
function StickerBlockImpl({ agentName, agentRole, agentAvatar, agentColour, emoji }: StickerBlockProps) {
  return (
    <div className="flex items-start gap-2 px-4">
      <div
        className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs text-white"
        style={{ backgroundColor: agentColour ?? '#888' }}
        title={`${agentName}（${agentRole}）`}
      >
        {agentAvatar ?? 'AI'}
      </div>
      <div className="flex flex-col items-start gap-0.5">
        <span className="text-xs text-muted-foreground">{agentName}</span>
        <div className="rounded-2xl rounded-tl-sm border border-border/60 bg-muted/40 px-4 py-3">
          <span className="text-4xl leading-none">{emoji}</span>
        </div>
      </div>
    </div>
  );
}

export const StickerBlock = memo(StickerBlockImpl);
