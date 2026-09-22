'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';
import { MessageBubble, type ChatFileAttachment } from './message-bubble';
import { InterjectionBlock } from './interjection-block';
import { AgentErrorBlock } from './agent-error-block';
import { StickerBlock } from './sticker-block';
import { parseResponse } from '@/lib/orchestrator/parse-interjections';
import { useI18n } from '@/lib/i18n';
import type { UIMessage } from 'ai';
import type { AgentConfig } from '@/lib/types/agents';

interface MessageListProps {
  messages: UIMessage[];
  primaryAgent?: AgentConfig;
  allAgents?: AgentConfig[];
  isStreaming?: boolean;
}

interface ResponseAgentSnapshot {
  id: string;
  name: string;
  role: string;
  avatar: string;
  colour: string;
  modelId: string;
  providerId: string;
}

interface AssistantMessageMetadata {
  primaryAgent?: ResponseAgentSnapshot;
}

function isAssistantMessageMetadata(value: unknown): value is AssistantMessageMetadata {
  if (!value || typeof value !== 'object') return false;
  const metadata = value as Partial<AssistantMessageMetadata>;
  const agent = metadata.primaryAgent as Partial<ResponseAgentSnapshot> | undefined;

  return (
    !agent ||
    (
      typeof agent.id === 'string' &&
      typeof agent.name === 'string' &&
      typeof agent.role === 'string' &&
      typeof agent.avatar === 'string' &&
      typeof agent.colour === 'string' &&
      typeof agent.modelId === 'string' &&
      typeof agent.providerId === 'string'
    )
  );
}

function toAgentSnapshot(agent: AgentConfig): ResponseAgentSnapshot {
  return {
    id: agent.id,
    name: agent.name,
    role: agent.role,
    avatar: agent.avatar,
    colour: agent.colour,
    modelId: agent.modelId,
    providerId: agent.providerId,
  };
}

function getResponseAgent(
  message: UIMessage,
  fallbackAgent: AgentConfig | undefined,
  useFallback: boolean,
): ResponseAgentSnapshot | undefined {
  if (isAssistantMessageMetadata(message.metadata)) {
    return message.metadata.primaryAgent;
  }

  return useFallback && fallbackAgent ? toAgentSnapshot(fallbackAgent) : undefined;
}

function findAgentForInterjection(
  agents: AgentConfig[],
  agentName: string,
  agentRole: string,
): AgentConfig | undefined {
  return agents.find((agent) => agent.name === agentName && agent.role === agentRole)
    ?? agents.find((agent) => agent.name === agentName);
}

interface MessageSegment {
  kind: 'primary' | 'interjection' | 'agent-error' | 'sticker' | 'reaction';
  text?: string;
  interjection?: { agentName: string; agentRole: string; agentAvatar?: string; agentColour?: string; content: string };
  agentError?: { agentName: string; agentAvatar: string; agentColour?: string; error: string };
  sticker?: { agentName: string; agentRole: string; agentAvatar?: string; agentColour?: string; emoji: string };
  reaction?: { agentName: string; agentRole: string; agentAvatar?: string; agentColour?: string; emoji: string; target: string };
}

export function MessageList({
  messages,
  primaryAgent,
  allAgents = [],
  isStreaming,
}: MessageListProps) {
  const { t } = useI18n();
  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const previousMessageCountRef = useRef(0);
  const lastScrollAtRef = useRef(0);

  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;

    const messageCountChanged = messages.length !== previousMessageCountRef.current;
    previousMessageCountRef.current = messages.length;

    if (messageCountChanged) {
      shouldAutoScrollRef.current = true;
      scrollElement.scrollTo({ top: scrollElement.scrollHeight, behavior: 'smooth' });
      return;
    }

    if (!shouldAutoScrollRef.current) return;

    // Throttle during streaming: tokens arrive faster than frames.
    const now = Date.now();
    if (now - lastScrollAtRef.current < 200) return;
    lastScrollAtRef.current = now;
    scrollElement.scrollTo({ top: scrollElement.scrollHeight });
  }, [messages]);

  const handleScroll = () => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;

    const distanceFromBottom =
      scrollElement.scrollHeight - scrollElement.scrollTop - scrollElement.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom < 80;
  };

  if (messages.length === 0) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center">
        <div className="text-center space-y-4 max-w-xl px-4">
          <Image
            src="/thecouncil.png"
            alt="The Council"
            width={1200}
            height={280}
            priority
            className="h-auto w-full dark:invert dark:mix-blend-screen"
          />
          <p className="text-muted-foreground">
            {t.emptyChat}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="min-h-0 flex-1 overflow-y-auto"
      onScroll={handleScroll}
    >
      <div className="mx-auto w-full max-w-3xl px-4 py-4">
        {messages.map((message, index) => {
          const isLast = index === messages.length - 1;
          const fileParts = message.parts
            ?.filter((p): p is ChatFileAttachment & { type: 'file' } => p.type === 'file')
            .map(({ filename, mediaType, url }) => ({ filename, mediaType, url })) ?? [];

          if (message.role === 'assistant') {
            const segments: MessageSegment[] = [];
            let primaryText = '';

            for (const part of message.parts ?? []) {
              if (part.type === 'text') {
                if (segments.length === 0) {
                  primaryText += part.text;
                } else {
                  // Fallback for legacy messages where interjections were
                  // embedded as markdown text after a data part.
                  segments[segments.length - 1].text =
                    (segments[segments.length - 1].text ?? '') + part.text;
                }
              } else if (part.type === 'data-interjection') {
                segments.push({ kind: 'interjection', interjection: part.data as MessageSegment['interjection'] });
              } else if (part.type === 'data-agent-error') {
                segments.push({ kind: 'agent-error', agentError: part.data as NonNullable<MessageSegment['agentError']> });
              } else if (part.type === 'data-sticker') {
                segments.push({ kind: 'sticker', sticker: part.data as MessageSegment['sticker'] });
              } else if (part.type === 'data-reaction') {
                segments.push({ kind: 'reaction', reaction: part.data as MessageSegment['reaction'] });
              }
            }

            if (!primaryText.trim() && segments.length === 0 && fileParts.length === 0) return null;

            // Legacy messages stored interjections inline in the text — parse them out.
            if (segments.length === 0 && /\\n\\n---\\n\\n|\n\n---\n\n/.test(primaryText)) {
              const parsed = parseResponse(primaryText);
              primaryText = parsed.primaryContent;
              for (const interjection of parsed.interjections) {
                segments.push({ kind: 'interjection', interjection });
              }
            }

            const responseAgent = getResponseAgent(
              message,
              primaryAgent,
              isLast && Boolean(isStreaming),
            );
            const streamingPrimary = isLast && isStreaming
              && segments.every((s) => s.kind === 'primary');

            return (
              <div key={message.id}>
                {primaryText.trim() && (
                  <MessageBubble
                    role="assistant"
                    content={primaryText}
                    files={fileParts}
                    responseKind="primary"
                    agentName={responseAgent?.name}
                    agentModel={responseAgent?.modelId}
                    agentAvatar={responseAgent?.avatar}
                    agentColour={responseAgent?.colour}
                    isStreaming={streamingPrimary}
                  />
                )}
                {segments.map((segment, i) => {
                  if (segment.kind === 'sticker' && segment.sticker) {
                    const sticker = segment.sticker;
                    const stickerAgent = findAgentForInterjection(allAgents, sticker.agentName, sticker.agentRole);
                    return (
                      <StickerBlock
                        key={`${message.id}-sticker-${i}`}
                        agentName={sticker.agentName}
                        agentRole={sticker.agentRole}
                        agentAvatar={stickerAgent?.avatar ?? sticker.agentAvatar ?? 'AI'}
                        agentColour={stickerAgent?.colour ?? sticker.agentColour}
                        emoji={sticker.emoji}
                      />
                    );
                  }

                  if (segment.kind === 'reaction' && segment.reaction) {
                    const reaction = segment.reaction;
                    const reactionAgent = findAgentForInterjection(allAgents, reaction.agentName, reaction.agentRole);
                    return (
                      <div
                        key={`${message.id}-reaction-${i}`}
                        className="flex items-center gap-1.5 px-4 text-xs text-muted-foreground"
                        title={`${reaction.agentName}: ${reaction.target}`}
                      >
                        <span
                          className="flex h-4 w-4 items-center justify-center rounded-full text-[8px] text-white"
                          style={{ backgroundColor: reactionAgent?.colour ?? reaction.agentColour ?? '#888' }}
                        >
                          {reactionAgent?.avatar ?? reaction.agentAvatar ?? 'AI'}
                        </span>
                        <span className="text-base leading-none">{reaction.emoji}</span>
                        <span className="truncate max-w-[200px]">
                          {reaction.agentName} 回应了“{reaction.target.length > 20 ? `${reaction.target.slice(0, 20)}…` : reaction.target}”
                        </span>
                      </div>
                    );
                  }

                  if (segment.kind === 'interjection' && segment.interjection) {
                    const interjection = segment.interjection;
                    const interjectionAgent = findAgentForInterjection(
                      allAgents,
                      interjection.agentName,
                      interjection.agentRole,
                    );

                    return (
                      <InterjectionBlock
                        key={`${message.id}-interjection-${i}`}
                        agentName={interjection.agentName}
                        agentRole={interjection.agentRole}
                        agentAvatar={interjectionAgent?.avatar ?? interjection.agentAvatar ?? 'AI'}
                        agentColour={interjectionAgent?.colour ?? interjection.agentColour}
                        content={interjection.content}
                      />
                    );
                  }

                  if (segment.kind === 'agent-error' && segment.agentError) {
                    const agentError = segment.agentError;
                    return (
                      <AgentErrorBlock
                        key={`${message.id}-agent-error-${i}`}
                        agentName={agentError.agentName}
                        agentAvatar={agentError.agentAvatar}
                        agentColour={agentError.agentColour}
                        error={agentError.error}
                      />
                    );
                  }

                  if (segment.text?.trim()) {
                    const interjectionAgent = segments[i - 1]?.interjection
                      ? findAgentForInterjection(
                          allAgents,
                          segments[i - 1].interjection!.agentName,
                          segments[i - 1].interjection!.agentRole,
                        )
                      : undefined;

                    return (
                      <InterjectionBlock
                        key={`${message.id}-interjection-${i}`}
                        agentName={segments[i - 1].interjection!.agentName}
                        agentRole={segments[i - 1].interjection!.agentRole}
                        agentAvatar={interjectionAgent?.avatar ?? segments[i - 1].interjection!.agentAvatar ?? 'AI'}
                        agentColour={interjectionAgent?.colour ?? segments[i - 1].interjection!.agentColour}
                        content={segment.text}
                      />
                    );
                  }

                  return null;
                })}
              </div>
            );
          }

          const textContent = message.parts
            ?.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
            .map((p) => p.text)
            .join('') ?? '';

          return (
            <MessageBubble
              key={message.id}
              role="user"
              content={textContent}
              files={fileParts}
            />
          );
        })}
      </div>
    </div>
  );
}
