'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar/sidebar';
import { ChatContainer } from '@/components/chat/chat-container';
import { ChatSettings } from '@/components/chat/chat-settings';
import type { AgentConfig } from '@/lib/types/agents';
import type { ConversationMode, SessionConfig } from '@/lib/types/council';
import type { CouncilConfig } from '@/lib/types/config';

export default function NewChatPage() {
  const router = useRouter();
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [primaryAgentId, setPrimaryAgentId] = useState<string | null>(null);
  const [mode, setMode] = useState<ConversationMode>('council');
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/config');
      const data = (await res.json()) as CouncilConfig;
      setAgents(data.agents ?? []);
      const primary = data.defaultPrimaryAgentId ?? data.agents?.[0]?.id ?? null;
      setPrimaryAgentId(primary);
      setMode(data.defaultMode ?? 'council');
      setSelectedAgentIds((data.agents ?? []).map((a) => a.id));
    } catch {
      // Config may not exist yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const primaryAgent = agents.find((a) => a.id === primaryAgentId);
  const activeAgentIds = selectedAgentIds.length > 0 ? selectedAgentIds : agents.map((a) => a.id);

  const sessionConfig: SessionConfig = {
    mode,
    primaryAgentId: primaryAgentId ?? '',
    agentIds: activeAgentIds,
  };

  const handleConversationCreated = (id: string) => {
    router.push(`/chat/${id}`);
  };

  if (loading) {
    return (
      <>
        <Sidebar defaultMode={mode} />
        <main className="flex-1 flex min-h-0 min-w-0 items-center justify-center overflow-hidden">
          <p className="text-muted-foreground">Loading...</p>
        </main>
      </>
    );
  }

  return (
    <>
      <Sidebar defaultMode={mode} />
      <main className="flex-1 flex min-h-0 min-w-0 flex-col overflow-hidden">
        <ChatSettings
          agents={agents}
          primaryAgentId={primaryAgentId}
          selectedAgentIds={activeAgentIds}
          mode={mode}
          onModeChange={setMode}
          onPrimaryAgentChange={setPrimaryAgentId}
          onSelectedAgentIdsChange={setSelectedAgentIds}
        />
        <ChatContainer
          sessionConfig={sessionConfig}
          primaryAgent={primaryAgent}
          allAgents={agents}
          onConversationCreated={handleConversationCreated}
        />
      </main>
    </>
  );
}
