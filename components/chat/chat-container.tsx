'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useChat } from '@ai-sdk/react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { MessageList } from './message-list';
import { MessageInput } from './message-input';
import type { AgentConfig } from '@/lib/types/agents';
import type { SessionConfig } from '@/lib/types/council';
import { useI18n } from '@/lib/i18n';


interface CouncilStatusData {
  phase: 'gate-check' | 'interjections' | 'round-robin' | 'done';
  pendingAgents: number;
  totalAgents: number;
  message: string;
}

function isCouncilStatusData(value: unknown): value is CouncilStatusData {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<CouncilStatusData>;
  return (
    typeof candidate.phase === 'string' &&
    typeof candidate.pendingAgents === 'number' &&
    typeof candidate.totalAgents === 'number' &&
    typeof candidate.message === 'string'
  );
}

interface ChatContainerProps {
  sessionConfig: SessionConfig;
  primaryAgent?: AgentConfig;
  allAgents?: AgentConfig[];
  conversationId?: string;
  initialMessages?: unknown[];
  onConversationCreated?: (id: string) => void;
}

export function ChatContainer({
  sessionConfig,
  primaryAgent,
  allAgents = [],
  conversationId,
  initialMessages,
  onConversationCreated,
}: ChatContainerProps) {
  const { t } = useI18n();
  const [councilStatusMessage, setCouncilStatusMessage] = useState('');
  const [isCouncilProcessing, setIsCouncilProcessing] = useState(false);
  const [isInputCollapsed, setIsInputCollapsed] = useState(false);
  const activeConversationId = useRef<string | undefined>(conversationId);

  const transport = useMemo(
    () => new DefaultChatTransport({
      api: '/api/chat',
    }),
    [],
  );

  const { messages, status, sendMessage, setMessages, stop, error, clearError } = useChat({
    transport,
    messages: initialMessages as UIMessage[] | undefined,
    onData: (part) => {
      if (part.type !== 'data-council-status') return;
      if (!isCouncilStatusData(part.data)) return;

      if (part.data.phase === 'done') {
        setCouncilStatusMessage('');
        setIsCouncilProcessing(false);
        return;
      }

      setIsCouncilProcessing(true);
      setCouncilStatusMessage(part.data.message);
    },
    onError: (err) => {
      setIsCouncilProcessing(false);
      setCouncilStatusMessage('');
      toast.error(err.message || t.chatFailed);
    },
  });

  const isStreaming = status === 'streaming' || status === 'submitted' || isCouncilProcessing;

  // Poll the server for conversation updates so every viewer stays in sync:
  // assistant output written by a wave is stored server-side under the same
  // message id the stream announced, so merging by id is enough to pick up
  // both new messages and parts appended to a message already on screen.
  // Only the local stream is skipped, so a stale live status can never wedge
  // this viewer into never polling again.
  useEffect(() => {
    if (!activeConversationId.current || !conversationId) return;
    let cancelled = false;

    const sync = async () => {
      if (status === 'streaming' || status === 'submitted') return;
      try {
        const res = await fetch(`/api/conversations/${conversationId}`);
        if (!res.ok || cancelled) return;
        const conv = await res.json();
        if (cancelled) return;

        const serverMessages = (conv.messages ?? []) as UIMessage[];
        if (serverMessages.length > 0) {
          setMessages((prev) => mergeServerMessages(prev, serverMessages));
        }

        // A wave running in another viewer keeps the status banner up.
        const liveStatus = conv.liveStatus as { message?: string } | null | undefined;
        setIsCouncilProcessing(Boolean(liveStatus?.message));
        setCouncilStatusMessage(liveStatus?.message ?? '');
      } catch {
        // Ignore polling errors
      }
    };

    const interval = setInterval(() => {
      void sync();
    }, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [conversationId, status, setMessages]);

  useEffect(() => {
    if (!error) return;
    clearError();
  }, [error, clearError]);

  const handleSend = async (text: string, files?: FileList, mentionedAgentIds?: string[]) => {
    if (!text.trim() && (!files || files.length === 0)) return;

    // Free-chat mode: while the group is still discussing, push the message into
    // the live context via the inject endpoint — the next gate check round picks
    // it up.
    if (sessionConfig.mode === 'free-chat' && isStreaming) {
      const conversationIdForInject = activeConversationId.current;
      // A wave only runs inside a conversation, so the id is always set here;
      // the guard just keeps the fetch honest.
      if (!conversationIdForInject) {
        toast.error(t.messageSendFailed);
        return;
      }
      // Read attachments as data URLs. A blob: URL only lives as long as this
      // page, so the stored message would show a broken attachment after a
      // reload, and the server could not hand the bytes to a model at all.
      const attachments = await readAttachments(files);
      // Show the message in the chat immediately (locally).
      const queuedMessage: UIMessage = {
        id: `queued-${Date.now()}`,
        role: 'user',
        parts: [
          ...(text ? [{ type: 'text' as const, text }] : []),
          ...attachments.map((file) => ({
            type: 'file' as const,
            url: file.url,
            mediaType: file.mediaType,
            filename: file.filename,
          })),
        ],
      };
      setMessages((prev) => [...prev, queuedMessage]);
      setIsCouncilProcessing(true);
      setCouncilStatusMessage(t.messageQueued);

      void fetch(`/api/conversations/${conversationIdForInject}/inject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // clientId = the queued message's id, so the server persists this
        // message under the same id and polling won't duplicate it.
        body: JSON.stringify({ text, clientId: queuedMessage.id, files: attachments }),
      }).catch(() => {
        // Delivery failed — the message would never reach the wave or the
        // conversation file, so take the optimistic copy back off the screen.
        setMessages((prev) => prev.filter((message) => message.id !== queuedMessage.id));
        toast.error(t.messageSendFailed);
      });
      return;
    }

    if (isStreaming) {
      // Other modes: stop the previous stream so the new user message can be sent immediately
      void stop();
      setIsCouncilProcessing(false);
      setCouncilStatusMessage('');
    }

    setIsCouncilProcessing(true);
    setCouncilStatusMessage(t.generatingResponse);

    // Create the conversation immediately on the first message so refreshes
    // mid-wave keep everything (server-side live persistence needs an id).
    let sendConversationId = activeConversationId.current;
    if (!sendConversationId) {
      const title = extractTitle(text);
      try {
        const res = await fetch('/api/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            mode: sessionConfig.mode,
            primaryAgentId: sessionConfig.primaryAgentId,
            agentIds: sessionConfig.agentIds,
          }),
        });
        if (!res.ok) throw new Error(`create failed: ${res.status}`);
        const conv = await res.json();
        sendConversationId = conv.id;
        activeConversationId.current = conv.id;
        onConversationCreated?.(conv.id);
      } catch {
        // Without a conversation there is nowhere to persist the message or
        // the wave — fail loudly instead of sending an ephemeral round.
        setIsCouncilProcessing(false);
        setCouncilStatusMessage('');
        toast.error(t.conversationCreateFailed);
        return;
      }
    }

    // The user message is persisted server-side by the chat route (single
    // AI SDK id, no duplicate). Send after a brief micro-delay to let the
    // abort controller settle.
    setTimeout(() => {
      sendMessage(
        { text, ...(files && files.length > 0 ? { files } : {}) },
        {
          body: {
            sessionConfig,
            ...(sendConversationId ? { conversationId: sendConversationId } : {}),
            ...(mentionedAgentIds && mentionedAgentIds.length > 0
              ? { mentionedAgentIds }
              : {}),
          },
        },
      );
    }, 50);
  };

  const handleStop = () => {
    // Aborting the request also aborts the server-side wave (request.signal);
    // everything the agents produced so far is already persisted there, so
    // there is nothing left for the client to save.
    void stop();
    setIsCouncilProcessing(false);
    setCouncilStatusMessage('');
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <MessageList
        messages={messages}
        primaryAgent={primaryAgent}
        allAgents={allAgents}
        isStreaming={isStreaming}
      />
      {isInputCollapsed ? (
        /* Collapsed minimal bottom bar */
        <div className="shrink-0 border-t bg-background/95 backdrop-blur-xs px-4 py-2 transition-all duration-200">
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {councilStatusMessage ? (
                <span className="flex items-center gap-2 text-xs font-medium text-primary truncate">
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                  </span>
                  <span className="truncate">{councilStatusMessage}</span>
                </span>
              ) : (
                <span className="text-xs text-muted-foreground/80 truncate">
                  沉浸观赏模式中 · 输入框已折叠
                </span>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsInputCollapsed(false)}
              className="h-8 rounded-full px-3.5 text-xs font-medium gap-1.5 shadow-2xs hover:border-primary/50 hover:bg-primary/5 transition-all shrink-0 cursor-pointer"
            >
              <ChevronUp className="h-3.5 w-3.5 text-primary" />
              <span>展开输入框</span>
            </Button>
          </div>
        </div>
      ) : (
        /* Expanded full input area */
        <div className="shrink-0 border-t bg-background px-4 pt-2 pb-4 transition-all duration-200">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center justify-between pb-1.5 px-1">
              {councilStatusMessage ? (
                <span className="text-xs text-primary font-medium truncate flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                  </span>
                  <span className="truncate">{councilStatusMessage}</span>
                </span>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={() => setIsInputCollapsed(true)}
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors px-2 py-0.5 rounded-md hover:bg-muted/60 cursor-pointer select-none ml-auto"
                title="隐藏输入框，全屏沉浸观看讨论"
              >
                <span>隐藏输入框</span>
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>
            <MessageInput
              onSend={handleSend}
              onStop={handleStop}
              isStreaming={isStreaming}
              allowSendWhileStreaming={true}
              statusText=""
              disabled={sessionConfig.mode !== 'free-chat' && !primaryAgent}
              agents={allAgents.filter((a) => sessionConfig.agentIds.includes(a.id))}
              placeholder={
                sessionConfig.mode === 'free-chat'
                  ? t.typeMessage
                  : primaryAgent
                    ? t.messagePlaceholder(primaryAgent.name)
                    : t.configureAgentFirst
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}

/** Extract a short title from the first user message. */
function extractTitle(text: string): string {
  const cleaned = text.trim().replace(/\n+/g, ' ');
  if (cleaned.length <= 50) return cleaned;
  return cleaned.slice(0, 47) + '...';
}

function partCount(message: UIMessage): number {
  return message.parts?.length ?? 0;
}

interface QueuedAttachment {
  url: string;
  mediaType: string;
  filename: string;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/** Inline attachments so they survive the page that produced them. */
async function readAttachments(files?: FileList): Promise<QueuedAttachment[]> {
  if (!files || files.length === 0) return [];

  try {
    return await Promise.all(
      Array.from(files).map(async (file) => ({
        url: await readAsDataUrl(file),
        mediaType: file.type || 'application/octet-stream',
        filename: file.name,
      })),
    );
  } catch {
    // An unreadable file must not swallow the message itself.
    return [];
  }
}

/**
 * Fold the server's stored conversation into the local message list.
 *
 * Parts are append-only, so for a message both sides have, the version with
 * more parts is the newer one. Messages the server does not have yet (the wave
 * streaming right now, a message queued locally) are kept at the end.
 */
function mergeServerMessages(local: UIMessage[], server: UIMessage[]): UIMessage[] {
  const localById = new Map(local.map((message) => [message.id, message]));
  const serverIds = new Set<string>();
  let changed = false;

  const merged = server.map((serverMessage) => {
    serverIds.add(serverMessage.id);
    const localMessage = localById.get(serverMessage.id);
    if (!localMessage) {
      changed = true;
      return serverMessage;
    }
    if (partCount(serverMessage) > partCount(localMessage)) {
      changed = true;
      return serverMessage;
    }
    return localMessage;
  });

  for (const message of local) {
    if (!serverIds.has(message.id)) {
      merged.push(message);
      changed = true;
    }
  }

  return changed ? merged : local;
}
