'use client';

import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useChat } from '@ai-sdk/react';
import { toast } from 'sonner';
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
  const activeConversationId = useRef<string | undefined>(conversationId);
  const pendingSave = useRef(false);

  const transport = useMemo(
    () => new DefaultChatTransport({
      api: '/api/chat',
    }),
    [],
  );

  const { messages, status, sendMessage, stop, error, clearError } = useChat({
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

  // Save messages to conversation whenever streaming finishes
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

  // Trigger save when streaming completes
  useEffect(() => {
    if (!isStreaming && pendingSave.current && messages.length > 0) {
      pendingSave.current = false;
      saveMessages(messages);
    }
  }, [isStreaming, messages, saveMessages]);

  useEffect(() => {
    if (!error) return;
    clearError();
  }, [error, clearError]);

  const handleSend = (text: string, files?: FileList, mentionedAgentIds?: string[]) => {
    if (!text.trim() && (!files || files.length === 0)) return;
    setIsCouncilProcessing(true);
    setCouncilStatusMessage(t.generatingResponse);
    pendingSave.current = false; // Will be set to true when done event arrives
    sendMessage(
      { text, ...(files && files.length > 0 ? { files } : {}) },
      {
        body: {
          sessionConfig,
          ...(mentionedAgentIds && mentionedAgentIds.length > 0
            ? { mentionedAgentIds }
            : {}),
        },
      },
    );
  };

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
      <div className="shrink-0 border-t bg-background p-4">
        <div className="max-w-3xl mx-auto">
          <MessageInput
            onSend={handleSend}
            onStop={handleStop}
            isStreaming={isStreaming}
            statusText={councilStatusMessage}
            disabled={!primaryAgent}
            agents={allAgents.filter((a) => sessionConfig.agentIds.includes(a.id))}
            placeholder={
              primaryAgent
                ? t.messagePlaceholder(primaryAgent.name)
                : t.configureAgentFirst
            }
          />
        </div>
      </div>
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

    return true;
  });
}

function filterPersistableMessages(messages: UIMessage[]): UIMessage[] {
  return messages.filter((message) => {
    if (message.role !== 'assistant') return true;
    return hasPersistableContent(message);
  });
}
