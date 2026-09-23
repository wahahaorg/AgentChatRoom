'use client';

import { useEffect, useRef } from 'react';
import { MessageBubble, type ChatFileAttachment } from './message-bubble';
import { InterjectionBlock } from './interjection-block';
import { AgentErrorBlock } from './agent-error-block';
import { StickerBlock } from './sticker-block';
import { parseResponse } from '@/lib/orchestrator/parse-interjections';
import { useI18n } from '@/lib/i18n';
import { Sparkles, MessageSquare, ShieldCheck, Eye } from 'lucide-react';
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
  sticker?: { agentName: string; agentRole: string; agentAvatar?: string; agentColour?: string; emoji?: string; imageUrl?: string; query?: string };
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

  // The AI SDK can re-emit a wave's assistant message under the same id when a
  // new discussion round starts mid-conversation — render only the latest
  // version of each id so React doesn't see duplicate keys.
  const dedupedMessages = messages.filter(
    (message, index) => messages.findLastIndex((m) => m.id === message.id) === index,
  );

  if (dedupedMessages.length === 0) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
        <div className="w-full max-w-xl space-y-6 text-center py-6">
          <div className="space-y-2">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-xs ring-1 ring-primary/20 mb-1">
              <Sparkles className="h-6 w-6" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              {t.emptyChatTitle}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
              {t.emptyChatSubtitle}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left pt-2">
            <div className="rounded-xl border border-border/70 bg-card/60 p-3.5 space-y-1.5 shadow-2xs">
              <div className="flex items-center gap-2 text-primary font-semibold text-xs">
                <ShieldCheck className="h-4 w-4" />
                <span>方案质询与互审</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                多智能体互相挑刺与补充，发现盲点与漏洞，形成更周全的决策。
              </p>
            </div>

            <div className="rounded-xl border border-border/70 bg-card/60 p-3.5 space-y-1.5 shadow-2xs">
              <div className="flex items-center gap-2 text-primary font-semibold text-xs">
                <MessageSquare className="h-4 w-4" />
                <span>多维专业视角</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                架构、安全、产品与业务多角色实时研讨，提供综合维度的专业见解。
              </p>
            </div>

            <div className="rounded-xl border border-border/70 bg-card/60 p-3.5 space-y-1.5 shadow-2xs">
              <div className="flex items-center gap-2 text-primary font-semibold text-xs">
                <Eye className="h-4 w-4" />
                <span>沉浸观战模式</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                一键隐藏折叠输入框，全屏沉浸观看 AI 智囊团头脑风暴与观点交锋。
              </p>
            </div>
          </div>

          <div className="pt-2 text-xs text-muted-foreground/80">
            💡 在左上角选择讨论场景，或直接在下方输入框发起议题
          </div>
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
        {dedupedMessages.map((message, index) => {
          const isLast = index === dedupedMessages.length - 1;
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
                        imageUrl={sticker.imageUrl}
                        query={sticker.query}
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

                  if (segment.kind === 'interjection' && segment.interjection && segment.interjection.content?.trim()) {
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
