'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar/sidebar';
import { ChatContainer } from '@/components/chat/chat-container';
import { ChatSettings } from '@/components/chat/chat-settings';
import type { AgentConfig } from '@/lib/types/agents';
import type { ConversationMode, Conversation, SessionConfig } from '@/lib/types/council';
import type { CouncilConfig } from '@/lib/types/config';

export default function ConversationPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const router = useRouter();
  const [allAgents, setAllAgents] = useState<AgentConfig[]>([]);
  const [activeSceneName, setActiveSceneName] = useState<string>('');
  // Every conversation in the current build uses the same chat glyph; there is
  // no per-conversation emoji picker left.
  const activeSceneEmoji = '💬';
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [primaryAgentId, setPrimaryAgentId] = useState<string | null>(null);
  const [mode, setMode] = useState<ConversationMode>('council');
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const [configRes, convRes] = await Promise.all([
          fetch('/api/config'),
          fetch(`/api/conversations/${conversationId}`),
        ]);

        const config = (await configRes.json()) as CouncilConfig;
        if (cancelled) return;
        setAllAgents(config.agents ?? []);

        if (!convRes.ok) {
          // Conversation not found — redirect to new chat
          router.replace('/chat');
          return;
        }

        const conv = (await convRes.json()) as Conversation;
        if (cancelled) return;
        // Older conversations may have duplicated assistant messages (same id
        // re-emitted per discussion wave) — keep only the latest version.
        const byId = new Map<string, unknown>();
        for (const m of conv.messages ?? []) byId.set((m as { id: string }).id, m);
        setConversation({ ...conv, messages: [...byId.values()] as typeof conv.messages });
        setPrimaryAgentId(conv.primaryAgentId || config.agents?.[0]?.id || null);
        setMode(conv.mode);
        setSelectedAgentIds(conv.agentIds.length > 0 ? conv.agentIds : (config.agents ?? []).map((a) => a.id));
        setActiveSceneName(conv.title || '研讨室');
      } catch {
        router.replace('/chat');
        return;
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [conversationId, router]);

  const handleModeChange = (newMode: ConversationMode) => {
    setMode(newMode);
    fetch(`/api/conversations/${conversationId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: newMode }),
    });
  };

  const handlePrimaryAgentChange = (agentId: string) => {
    setPrimaryAgentId(agentId);
    fetch(`/api/conversations/${conversationId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ primaryAgentId: agentId }),
    });
  };

  const handleSelectedAgentIdsChange = (ids: string[]) => {
    setSelectedAgentIds(ids);
    fetch(`/api/conversations/${conversationId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentIds: ids }),
    });
  };

  const primaryAgent = allAgents.find((a) => a.id === primaryAgentId);
  const activeAgentIds = selectedAgentIds.length > 0 ? selectedAgentIds : allAgents.map((a) => a.id);

  const sessionConfig: SessionConfig = {
    mode,
    primaryAgentId: primaryAgentId ?? '',
    agentIds: activeAgentIds,
    conversationId,
  };

  if (loading) {
    return (
      <>
        <Sidebar activeConversationId={conversationId} />
        <main className="flex-1 flex min-h-0 min-w-0 items-center justify-center overflow-hidden">
          <p className="text-muted-foreground">Loading...</p>
        </main>
      </>
    );
  }

  return (
    <>
      <Sidebar activeConversationId={conversationId} />
      <main className="flex-1 flex min-h-0 min-w-0 flex-col overflow-hidden">
        <ChatSettings
          title={activeSceneName || conversation?.title}
          activeSceneName={activeSceneName || conversation?.title}
          activeSceneEmoji={activeSceneEmoji}
          agents={allAgents}
          primaryAgentId={primaryAgentId}
          selectedAgentIds={activeAgentIds}
          mode={mode}
          onModeChange={handleModeChange}
          onPrimaryAgentChange={handlePrimaryAgentChange}
          onSelectedAgentIdsChange={handleSelectedAgentIdsChange}
        />
        <ChatContainer
          key={conversationId}
          sessionConfig={sessionConfig}
          primaryAgent={primaryAgent}
          allAgents={allAgents}
          conversationId={conversationId}
          initialMessages={conversation?.messages}
        />
      </main>
    </>
  );
}
