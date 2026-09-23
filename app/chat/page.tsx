'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar/sidebar';
import { ChatContainer } from '@/components/chat/chat-container';
import { ChatSettings } from '@/components/chat/chat-settings';
import { applySavedScene } from '@/lib/scenes/apply-scene';
import type { AgentConfig } from '@/lib/types/agents';
import type { ConversationMode, SessionConfig } from '@/lib/types/council';
import type { CouncilConfig } from '@/lib/types/config';
import type { Scene } from '@/lib/types/scene';

export default function NewChatPage() {
  const router = useRouter();
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [activeSceneName, setActiveSceneName] = useState<string>('综合研讨室');
  const [activeSceneEmoji, setActiveSceneEmoji] = useState<string>('💬');
  const [primaryAgentId, setPrimaryAgentId] = useState<string | null>(null);
  const [mode, setMode] = useState<ConversationMode>('council');
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/config');
      const data = (await res.json()) as CouncilConfig;
      setAgents(data.agents ?? []);
      setScenes(data.scenes ?? []);
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

  const handleSelectScene = (scene: Scene) => {
    const result = applySavedScene(scene, agents);
    setSelectedAgentIds(result.selectedAgentIds);
    setPrimaryAgentId(result.primaryAgentId);
    setMode(result.mode);
    setActiveSceneName(result.sceneName);
    setActiveSceneEmoji(scene.emoji || '🎯');
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
          title={activeSceneName}
          activeSceneName={activeSceneName}
          activeSceneEmoji={activeSceneEmoji}
          agents={agents}
          scenes={scenes}
          primaryAgentId={primaryAgentId}
          selectedAgentIds={activeAgentIds}
          mode={mode}
          onModeChange={setMode}
          onPrimaryAgentChange={setPrimaryAgentId}
          onSelectedAgentIdsChange={setSelectedAgentIds}
          onSelectScene={handleSelectScene}
          onCreateScene={handleCreateScene}
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
