'use client';

import { memo, useState } from 'react';

interface StickerBlockProps {
  agentName: string;
  agentRole: string;
  agentAvatar?: string;
  agentColour?: string;
  emoji?: string;
  imageUrl?: string;
  query?: string;
}

/** A standalone sticker message sent by an agent — emoji or meme image (表情包). */
function StickerBlockImpl({ agentName, agentRole, agentAvatar, agentColour, emoji, imageUrl, query }: StickerBlockProps) {
  const [failed, setFailed] = useState(false);
  const showImage = imageUrl && !failed;

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
        <div className="rounded-2xl rounded-tl-sm border border-border/60 bg-muted/40 p-1.5">
          {showImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={query ?? '表情包'}
              className="max-h-40 max-w-52 rounded-xl object-contain"
              onError={() => setFailed(true)}
              loading="lazy"
            />
          ) : (
            <span className="block px-3 py-2 text-4xl leading-none">{emoji ?? '🤣'}</span>
          )}
        </div>
      </div>
    </div>
  );
}

export const StickerBlock = memo(StickerBlockImpl);
