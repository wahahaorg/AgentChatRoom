'use client';

import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
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
  const pendingSave = useRef(false);

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
        pendingSave.current = true;
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

  // Poll the server for new messages so all viewers of the conversation stay
  // in sync (another viewer's messages and live agent output land here too).
  // Skipped while this client is streaming to avoid clobbering local state.
  useEffect(() => {
    if (!activeConversationId.current || !conversationId) return;
    const interval = setInterval(async () => {
      if (status === 'streaming' || status === 'submitted' || isCouncilProcessing) return;
      try {
        const res = await fetch(`/api/conversations/${conversationId}`);
        if (!res.ok) return;
        const conv = await res.json();
        const serverMessages = (conv.messages ?? []) as UIMessage[];
        if (serverMessages.length === 0) return;
        setMessages((prev) => {
          const localIds = new Set(prev.map((m) => m.id));
          const missing = serverMessages.filter((m) => !localIds.has(m.id));
          if (missing.length === 0) return prev;
          return [...prev, ...missing];
        });
        // Show the live orchestration status emitted by another viewer's wave.
        const liveStatus = conv.liveStatus as { message?: string } | null | undefined;
        if (liveStatus?.message) {
          setIsCouncilProcessing(true);
          setCouncilStatusMessage(liveStatus.message);
        } else if (!isCouncilProcessing || liveStatus === null) {
          setIsCouncilProcessing(false);
          setCouncilStatusMessage('');
        }
      } catch {
        // Ignore polling errors
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [conversationId, status, isCouncilProcessing, setMessages]);

  // Free-chat mode: messages sent while the group is still discussing are
  // queued and automatically sent as the next round when the current wave ends.
  const pendingSendRef = useRef<{ text: string; files?: FileList; mentionedAgentIds?: string[] } | null>(null);
  const handleSendRef = useRef<(text: string, files?: FileList, mentionedAgentIds?: string[]) => void>(() => {});

  const saveMessages = useCallback(async (msgs: UIMessage[]) => {
    const messagesToSave = filterPersistableMessages(msgs);
    if (messagesToSave.length === 0) return;

    if (!activeConversationId.current) {
      // Create a new conversation from the first message
      const firstUserMsg = messagesToSave.find((m) => m.role === 'user');
      const title = firstUserMsg
        ? extractTitle(
            firstUserMsg.parts
              ?.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
              .map((p) => p.text)
              .join('') ?? 'New Chat'
          )
        : 'New Chat';

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
        if (res.ok) {
          const conv = await res.json();
          activeConversationId.current = conv.id;
          // Save messages to the newly created conversation
          await fetch(`/api/conversations/${conv.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: messagesToSave }),
          });
          onConversationCreated?.(conv.id);
        }
      } catch {
        // Silent failure
      }
    } else {
      // Update existing conversation
      try {
        await fetch(`/api/conversations/${activeConversationId.current}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: messagesToSave }),
        });
      } catch {
        // Silent failure
      }
    }
  }, [sessionConfig, onConversationCreated]);

  // Save when streaming completes; flush a queued free-chat message as the next round.
  useEffect(() => {
    if (!isStreaming && pendingSave.current && messages.length > 0) {
      pendingSave.current = false;
      void saveMessages(messages);
    }
    if (!isStreaming && pendingSendRef.current) {
      const queued = pendingSendRef.current;
      pendingSendRef.current = null;
      handleSendRef.current(queued.text, queued.files, queued.mentionedAgentIds);
    }
  }, [isStreaming, messages, saveMessages]);

  useEffect(() => {
    if (!error) return;
    clearError();
  }, [error, clearError]);

  const handleSend = async (text: string, files?: FileList, mentionedAgentIds?: string[]) => {
    if (!text.trim() && (!files || files.length === 0)) return;

    // Free-chat mode: while the group is still discussing, push the message into
    // the live context via the inject endpoint — the next gate check round picks
    // it up. Falls back to the end-of-wave queue for brand-new conversations
    // that don't have an id yet.
    if (sessionConfig.mode === 'free-chat' && isStreaming) {
      // Show the message in the chat immediately (locally).
      const queuedMessage: UIMessage = {
        id: `queued-${Date.now()}`,
        role: 'user',
        parts: [
          { type: 'text', text },
          ...Array.from(files ?? []).map((file) => ({
            type: 'file' as const,
            url: URL.createObjectURL(file),
            mediaType: file.type || 'application/octet-stream',
            filename: file.name,
          })),
        ],
      };
      setMessages((prev) => [...prev, queuedMessage]);
      setIsCouncilProcessing(true);
      setCouncilStatusMessage(t.messageQueued);

      if (activeConversationId.current) {
        void fetch(`/api/conversations/${activeConversationId.current}/inject`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        }).catch(() => {
          pendingSendRef.current = { text, files, mentionedAgentIds };
        });
      } else {
        pendingSendRef.current = { text, files, mentionedAgentIds };
      }
      return;
    }

    if (isStreaming) {
      // Other modes: stop the previous stream so the new user message can be sent immediately
      void stop();
      setIsCouncilProcessing(false);
      setCouncilStatusMessage('');
    }

    pendingSave.current = false;
    setIsCouncilProcessing(true);
    setCouncilStatusMessage(t.generatingResponse);

    // Create the conversation immediately on the first message so refreshes
    // mid-wave keep everything (server-side live persistence needs an id).
    let sendConversationId = activeConversationId.current;
    if (!sendConversationId) {
      const firstUserMsg: UIMessage = {
        id: `pending-${Date.now()}`,
        role: 'user',
        parts: [{ type: 'text', text }],
      };
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
        if (res.ok) {
          const conv = await res.json();
          sendConversationId = conv.id;
          activeConversationId.current = conv.id;
          onConversationCreated?.(conv.id);
        }
      } catch {
        // Fall back to creating it at end-of-wave save
      }
      void firstUserMsg;
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
  handleSendRef.current = handleSend;

  const handleStop = () => {
    void stop();
    setIsCouncilProcessing(false);
    setCouncilStatusMessage('');
    // Save whatever we have so far
    if (messages.length > 0) {
      saveMessages(messages);
    }
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

function hasPersistableContent(message: UIMessage): boolean {
  const parts = message.parts ?? [];

  return parts.some((part) => {
    if (part.type === 'text') {
      return part.text.trim().length > 0;
    }

    if (part.type === 'reasoning' || part.type === 'step-start') {
      return false;
    }

    if (part.type === 'data-interjection') {
      const data = part.data as { content?: string } | undefined;
      return Boolean(data?.content?.trim());
    }

    return true;
  });
}

function filterPersistableMessages(messages: UIMessage[]): UIMessage[] {
  const filtered = messages.filter((message) => {
    if (message.role !== 'assistant') return true;
    return hasPersistableContent(message);
  });

  // The AI SDK can re-emit a wave's assistant message under the same id when
  // a new discussion round starts mid-conversation — keep only the latest
  // version of each id so stored interjections don't render twice.
  const latestById = new Map<string, number>();
  filtered.forEach((message, index) => latestById.set(message.id, index));
  return filtered.filter((message, index) => latestById.get(message.id) === index);
}
