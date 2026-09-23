'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar/sidebar';
import { ChatContainer } from '@/components/chat/chat-container';
import { ChatSettings } from '@/components/chat/chat-settings';
import { applySavedScene } from '@/lib/scenes/apply-scene';
import type { AgentConfig } from '@/lib/types/agents';
import type { ConversationMode, Conversation, SessionConfig } from '@/lib/types/council';
import type { CouncilConfig } from '@/lib/types/config';
import type { Scene } from '@/lib/types/scene';

export default function ConversationPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const router = useRouter();
  const [allAgents, setAllAgents] = useState<AgentConfig[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [activeSceneName, setActiveSceneName] = useState<string>('');
  const [activeSceneEmoji, setActiveSceneEmoji] = useState<string>('💬');
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [primaryAgentId, setPrimaryAgentId] = useState<string | null>(null);
  const [mode, setMode] = useState<ConversationMode>('council');
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [configRes, convRes] = await Promise.all([
        fetch('/api/config'),
        fetch(`/api/conversations/${conversationId}`),
      ]);

      const config = (await configRes.json()) as CouncilConfig;
      setAllAgents(config.agents ?? []);
      setScenes(config.scenes ?? []);

      if (convRes.ok) {
        const conv = (await convRes.json()) as Conversation;
        // Older conversations may have duplicated assistant messages (same id
        // re-emitted per discussion wave) — keep only the latest version.
        const byId = new Map<string, unknown>();
        for (const m of conv.messages ?? []) byId.set((m as { id: string }).id, m);
        setConversation({ ...conv, messages: [...byId.values()] as typeof conv.messages });
        setPrimaryAgentId(conv.primaryAgentId || config.agents?.[0]?.id || null);
        setMode(conv.mode);
        setSelectedAgentIds(conv.agentIds.length > 0 ? conv.agentIds : (config.agents ?? []).map((a) => a.id));
        setActiveSceneName(conv.title || '研讨室');
      } else {
        // Conversation not found — redirect to new chat
        router.replace('/chat');
        return;
      }
    } catch {
      router.replace('/chat');
      return;
    } finally {
      setLoading(false);
    }
  }, [conversationId, router]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

  const handleSelectScene = (scene: Scene) => {
    const result = applySavedScene(scene, allAgents);
    setSelectedAgentIds(result.selectedAgentIds);
    setPrimaryAgentId(result.primaryAgentId);
    setMode(result.mode);
    setActiveSceneName(result.sceneName);
    setActiveSceneEmoji(scene.emoji || '🎯');

    fetch(`/api/conversations/${conversationId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentIds: result.selectedAgentIds,
        mode: result.mode,
        primaryAgentId: result.primaryAgentId,
      }),
    });
  };

  const handleCreateScene = async (newScene: Scene) => {
    const updatedScenes = [...scenes, newScene];
    setScenes(updatedScenes);
    try {
      await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenes: updatedScenes }),
      });
    } catch {
      // Ignore background save errors
    }
    handleSelectScene(newScene);
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
          scenes={scenes}
          primaryAgentId={primaryAgentId}
          selectedAgentIds={activeAgentIds}
          mode={mode}
          onModeChange={handleModeChange}
          onPrimaryAgentChange={handlePrimaryAgentChange}
          onSelectedAgentIdsChange={handleSelectedAgentIdsChange}
          onSelectScene={handleSelectScene}
          onCreateScene={handleCreateScene}
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
