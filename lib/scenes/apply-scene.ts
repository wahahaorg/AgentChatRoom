import type { AgentConfig } from '@/lib/types/agents';
import type { SceneTemplate } from '@/lib/agents/presets';
import type { Scene } from '@/lib/types/scene';
import type { ConversationMode } from '@/lib/types/council';

export interface AppliedSceneResult {
  allAgents: AgentConfig[];
  selectedAgentIds: string[];
  primaryAgentId: string | null;
  mode: ConversationMode;
  sceneName: string;
}

/**
 * Ensures agents required by a scene template exist in system config (creates them if not),
 * and resolves their IDs, mode, and lead agent.
 */
export async function applySceneTemplate(
  template: SceneTemplate,
  currentAgents: AgentConfig[] = [],
): Promise<AppliedSceneResult> {
  const existingNames = new Set(currentAgents.map((a) => a.name));
  const toCreate = template.members.filter((m) => !existingNames.has(m.name));

  let newlyCreated: AgentConfig[] = [];
  if (toCreate.length > 0) {
    const res = await fetch('/api/agents/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agents: toCreate.map((m) => ({ ...m, scene: template.name })),
      }),
    });
    if (res.ok) {
      const data = await res.json();
      newlyCreated = data.agents ?? [];
    }
  }

  const allAgents = [...currentAgents, ...newlyCreated];
  const selectedAgentIds = template.members
    .map((m) => allAgents.find((a) => a.name === m.name)?.id)
    .filter((id): id is string => Boolean(id));

  return {
    allAgents,
    selectedAgentIds,
    primaryAgentId: selectedAgentIds[0] ?? null,
    mode: template.mode,
    sceneName: template.name,
  };
}

/**
 * Resolves a user-saved custom scene against available agents.
 */
export function applySavedScene(
  scene: Scene,
  availableAgents: AgentConfig[],
): {
  selectedAgentIds: string[];
  primaryAgentId: string | null;
  mode: ConversationMode;
  sceneName: string;
} {
  const validIds = (scene.agentIds ?? []).filter((id) =>
    availableAgents.some((a) => a.id === id)
  );

  return {
    selectedAgentIds: validIds.length > 0 ? validIds : (availableAgents ?? []).map((a) => a.id),
    primaryAgentId: validIds[0] ?? availableAgents[0]?.id ?? null,
    mode: scene.mode,
    sceneName: scene.name,
  };
}

