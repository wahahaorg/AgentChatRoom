import { NextResponse } from 'next/server';
import { readConfig, writeConfig } from '@/lib/storage/config-store';
import { nanoid } from 'nanoid';
import type { AgentConfig } from '@/lib/types/agents';

const AGENT_COLOURS = [
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1',
];

interface IncomingAgent {
  name?: string;
  role?: string;
  systemPrompt?: string;
  avatar?: string;
  colour?: string;
  scene?: string;
}

/** POST /api/agents/batch — create multiple agents at once (scene templates). */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { agents?: IncomingAgent[] };
    const incoming = (body.agents ?? []).filter((a) => a.name && a.systemPrompt);
    if (incoming.length === 0) {
      return NextResponse.json({ error: 'agents required' }, { status: 400 });
    }

    const config = await readConfig();
    const colourOffset = config.agents.length;

    const created: AgentConfig[] = incoming.map((a, i) => ({
      id: nanoid(),
      name: a.name!,
      role: a.role ?? '',
      systemPrompt: a.systemPrompt!,
      providerId: 'openrouter' as const,
      modelId: '',
      colour: a.colour ?? AGENT_COLOURS[(colourOffset + i) % AGENT_COLOURS.length],
      avatar: a.avatar ?? 'AI',
      ...(a.scene ? { scene: a.scene } : {}),
    }));

    // Fill provider/model from the first existing agent so scene agents
    // use a provider that is actually configured.
    const reference = config.agents[0];
    const withModel = created.map((a) =>
      reference
        ? { ...a, providerId: reference.providerId, modelId: reference.modelId, thinking: reference.thinking }
        : a,
    );

    if (!reference) {
      return NextResponse.json(
        { error: 'Create at least one agent in Settings first (to pick up its provider/model).' },
        { status: 400 },
      );
    }

    await writeConfig({ ...config, agents: [...config.agents, ...withModel] });
    return NextResponse.json({ agents: withModel });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create agents' },
      { status: 500 },
    );
  }
}
