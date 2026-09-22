import {
  streamText,
  generateText,
  tool,
  type ModelMessage,
  type UIMessageStreamWriter,
} from 'ai';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { createModelInstance, getThinkingParams } from '@/lib/providers/provider-factory';
import { compressContextIfNeeded, estimateTokens } from '@/lib/orchestrator/context-compressor';
import type { AgentConfig } from '@/lib/types/agents';
import type { CouncilConfig, OrchestrationConfig } from '@/lib/types/config';
import type { SessionConfig, GateDecision } from '@/lib/types/council';
import { consumePendingUserMessages } from '@/lib/orchestrator/pending-messages';

interface OrchestratorContext {
  config: CouncilConfig;
  sessionConfig: SessionConfig;
  modelMessages: ModelMessage[];
  orchestration: OrchestrationConfig;
  /** Agent IDs @-mentioned in the latest user message. */
  mentionedAgentIds: string[];
}

interface CouncilStatusData {
  phase: 'gate-check' | 'interjections' | 'round-robin' | 'done';
  pendingAgents: number;
  totalAgents: number;
  message: string;
}

const ALLOWED_REACTIONS = ['👍', '😂', '😭', '🤯', '👀', '🔥', '💔', '🎉', '😅', '🤔'];

/** Tools agents can call to react with emoji or send a standalone sticker. */
function createReactionTools(agentName: string, stickerToken: string | undefined) {
  return {
    react_to_message: tool({
      description: 'React to a message in the group with an emoji (like WeChat message reactions). Use when you agree, find it funny, or want to acknowledge without a long reply.',
      inputSchema: z.object({
        emoji: z.enum(ALLOWED_REACTIONS as [string, ...string[]]).describe('The emoji to react with'),
        target: z.string().describe('Short quote or description of the message you are reacting to'),
      }),
      execute: async () => ({ ok: true }),
    }),
    send_sticker: tool({
      description: 'Send a standalone emoji sticker message (like sending a meme/表情包 in a group chat). Use when an emoji alone expresses your reaction better than words.',
      inputSchema: z.object({
        emoji: z.enum(ALLOWED_REACTIONS as [string, ...string[]]).describe('The emoji to send as a sticker'),
      }),
      execute: async () => ({ ok: true }),
    }),
    ...(stickerToken
      ? {
          send_sticker_image: tool({
            description: 'Send a Chinese meme sticker image (表情包/斗图, e.g. 熊猫头, 金馆长). Search with precise Chinese keywords describing the meme you want (e.g. "熊猫头无语", "金馆长大笑") and a random matching image is sent.',
            inputSchema: z.object({
              query: z.string().describe('Precise Chinese keywords for the meme to search, e.g. 熊猫头摇头, 金馆长大笑, 蘑菇头无语'),
            }),
            execute: async () => ({ ok: true }),
          }),
        }
      : {}),
  };
}

type ReactionCall = { kind: 'reaction'; emoji: string; target: string } | { kind: 'sticker'; emoji: string } | { kind: 'sticker-image'; query: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractReactionCalls(result: { toolCalls: readonly any[] }): ReactionCall[] {
  const calls: ReactionCall[] = [];
  for (const call of result.toolCalls) {
    const input = call.input as { emoji?: string; target?: string; query?: string };
    if (typeof input?.emoji !== 'string') continue;
    if (call.toolName === 'react_to_message' && typeof input.target === 'string') {
      calls.push({ kind: 'reaction', emoji: input.emoji, target: input.target });
    } else if (call.toolName === 'send_sticker') {
      calls.push({ kind: 'sticker', emoji: input.emoji });
    } else if (call.toolName === 'send_sticker_image' && typeof input.query === 'string') {
      calls.push({ kind: 'sticker-image', query: input.query });
    }
  }
  return calls;
}

/** Search a Chinese meme sticker image by keywords; returns null on failure. */
async function searchStickerImage(query: string, stickerToken: string): Promise<string | null> {
  try {
    const url = `https://v3.alapi.cn/api/doutu?token=${encodeURIComponent(stickerToken)}&keyword=${encodeURIComponent(query)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const json = await res.json() as { success?: boolean; data?: string[] };
    const images = Array.isArray(json?.data) ? json.data.filter((u) => typeof u === 'string') : [];
    if (images.length === 0) return null;
    return images[Math.floor(Math.random() * images.length)];
  } catch {
    return null;
  }
}

function writeSticker(writer: UIMessageStreamWriter, agent: AgentConfig, emoji: string): void {
  writer.write({
    type: 'data-sticker',
    data: {
      agentId: agent.id,
      agentName: agent.name,
      agentRole: agent.role,
      agentAvatar: agent.avatar,
      agentColour: agent.colour,
      emoji,
    },
  });
}

function writeStickerImage(writer: UIMessageStreamWriter, agent: AgentConfig, imageUrl: string, query: string): void {
  writer.write({
    type: 'data-sticker',
    data: {
      agentId: agent.id,
      agentName: agent.name,
      agentRole: agent.role,
      agentAvatar: agent.avatar,
      agentColour: agent.colour,
      imageUrl,
      query,
    },
  });
}

/** A reaction on a specific message, emitted as its own data part. */
function writeInterjectionReaction(
  writer: UIMessageStreamWriter,
  emoji: string,
  agent: AgentConfig,
  target: string,
): void {
  writer.write({
    type: 'data-reaction',
    data: {
      agentId: agent.id,
      agentName: agent.name,
      agentRole: agent.role,
      agentAvatar: agent.avatar,
      agentColour: agent.colour,
      emoji,
      target,
    },
  });
}

function writeResponseMetadata(
  writer: UIMessageStreamWriter,
  agent: AgentConfig,
  mode: SessionConfig['mode'],
): void {
  writer.write({
    type: 'start',
    // Fresh id per wave: without this, the AI SDK client reuses the last
    // assistant message's id and new interjections merge into old messages.
    messageId: nanoid(),
    messageMetadata: {
      primaryAgent: {
        id: agent.id,
        name: agent.name,
        role: agent.role,
        avatar: agent.avatar,
        colour: agent.colour,
        providerId: agent.providerId,
        modelId: agent.modelId,
      },
      mode,
    },
  });
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createRequestPacer(orchestration: OrchestrationConfig): () => Promise<void> {
  let nextAllowedAt = 0;

  return async () => {
    const spacingMs = Math.max(0, orchestration.requestSpacingMs);
    if (spacingMs <= 0) {
      nextAllowedAt = Date.now();
      return;
    }

    const now = Date.now();
    const waitMs = Math.max(0, nextAllowedAt - now);
    if (waitMs > 0) {
      await sleep(waitMs);
    }
    nextAllowedAt = Date.now() + spacingMs;
  };
}

function isRetryableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error ?? '').toLowerCase();

  const nonRetryablePatterns = [
    'is not found for api version',
    'not supported for generatecontent',
    'unknown provider',
    'no api key configured',
    'invalid api key',
    'authentication',
    'permission denied',
    'forbidden',
  ];

  if (nonRetryablePatterns.some((pattern) => message.includes(pattern))) {
    return false;
  }

  const retryablePatterns = [
    'rate limit',
    'quota exceeded',
    'too many requests',
    'temporar',
    'timeout',
    'network',
    'service unavailable',
    'overloaded',
    '502',
    '503',
    '504',
    '429',
  ];

  return retryablePatterns.some((pattern) => message.includes(pattern));
}

function getBackoffDelayMs(
  attempt: number,
  orchestration: OrchestrationConfig,
): number {
  const initial = Math.max(0, orchestration.requestBackoffInitialMs);
  const max = Math.max(initial, orchestration.requestBackoffMaxMs);
  const jitterRatio = Math.max(0, Math.min(orchestration.requestBackoffJitterRatio, 1));

  const exponential = Math.min(max, initial * Math.pow(2, attempt));
  const jitter = Math.floor(exponential * jitterRatio * Math.random());
  return Math.min(max, exponential + jitter);
}

async function runWithRetryBackoff<T>(
  label: string,
  orchestration: OrchestrationConfig,
  run: () => Promise<T>,
): Promise<T> {
  const attempts = Math.max(1, orchestration.requestRetryAttempts);

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await run();
    } catch (error) {
      const hasMoreAttempts = attempt < attempts - 1;
      if (!hasMoreAttempts || !isRetryableError(error)) {
        throw error;
      }

      const delayMs = getBackoffDelayMs(attempt, orchestration);
      console.warn(`[council:retry] ${label} failed (attempt ${attempt + 1}/${attempts}), retrying in ${delayMs}ms: ${error instanceof Error ? error.message : error}`);
      await sleep(delayMs);
    }
  }

  throw new Error(`Failed to execute ${label}`);
}

function writeCouncilStatus(
  writer: UIMessageStreamWriter,
  status: CouncilStatusData,
): void {
  writer.write({
    type: 'data-council-status',
    data: status,
    transient: true,
  });
}

/**
 * Strip any role-played "other agent" sections from an agent's output.
 * Some models role-play fellow group members (writing "✈ 亚航老油条——..."
 * blocks) instead of speaking only for themselves. This removes those
 * blocks: from a line that starts with another agent's name onwards.
 */
function stripRolePlayedSpeakers(text: string, speakerName: string, agents: AgentConfig[]): string {
  const otherNames = agents
    .map((a) => a.name)
    .filter((name) => name && name !== speakerName);

  const lines = text.split('\n');
  const kept: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    // A line that *starts* with another member's name is a role-played header.
    const isRolePlayedHeader = otherNames.some((name) => {
      if (!trimmed.startsWith(name)) return false;
      const rest = trimmed.slice(name.length);
      // Header-ish: followed by emoji, punctuation, separators or anything non-sentence-continuation.
      return /^[\s\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}—\-–—:：、,.，。!！?？]/u.test(rest);
    });

    if (isRolePlayedHeader) {
      break; // Everything from here on is role-played content.
    }
    kept.push(line);
  }

  return kept.join('\n').trim();
}

/**
 * Run the primary agent and stream its response to the writer.
 * Returns the full text once streaming completes.
 */
async function streamPrimaryAgent(
  agent: AgentConfig,
  ctx: OrchestratorContext,
  writer: UIMessageStreamWriter,
  waitForRequestSlot: () => Promise<void>,
): Promise<string> {
  await waitForRequestSlot();

  const model = createModelInstance(agent, ctx.config);
  const providerOptions = getThinkingParams(agent);

  const result = streamText({
    model,
    system: agent.systemPrompt,
    messages: ctx.modelMessages,
    ...(Object.keys(providerOptions).length > 0
      ? { providerOptions: providerOptions as never }
      : {}),
  });

  const id = nanoid();
  let text = '';
  let written = '';
  let started = false;
  let ended = false;

  try {
    for await (const delta of result.textStream) {
      if (!delta) continue;

      if (!started) {
        writer.write({ type: 'text-start', id });
        started = true;
      }

      text += delta;
      // Server-side guard: once the model starts role-playing other members,
      // stop writing the rest of the stream.
      const cleaned = stripRolePlayedSpeakers(text, agent.name, ctx.config.agents);
      if (cleaned.length < written.length) continue;
      const newDelta = cleaned.slice(written.length);
      if (newDelta) {
        written = cleaned;
        writer.write({ type: 'text-delta', id, delta: newDelta });
      }
    }

    if (started) {
      writer.write({ type: 'text-end', id });
      ended = true;
    }

    if (!written.trim()) {
      throw new Error('No output generated by the primary agent.');
    }

    return written;
  } catch (error) {
    if (started && !ended) {
      writer.write({ type: 'text-end', id });
    }
    throw error;
  }
}

/**
 * Gate check: ask a silent agent whether it has something meaningful to add.
 * Returns a YES/NO decision with a brief reason.
 */
async function runGateCheck(
  agent: AgentConfig,
  primaryAgentName: string,
  primaryResponse: string,
  ctx: OrchestratorContext,
  waitForRequestSlot: () => Promise<void>,
): Promise<GateDecision> {
  const isGroupChat = primaryAgentName === 'GROUP_CHAT';
  const gatePrompt = `You are ${agent.name}, a ${agent.role}.

${isGroupChat
    ? `You are chatting in a group. The recent discussion and latest user message:\n\n---\n${primaryResponse}\n---`
    : `You have been silently observing a conversation. The primary agent (${primaryAgentName}) just responded:\n\n---\n${primaryResponse}\n---`}

Do you want to speak now? Say YES if you have something meaningful to say — a disagreement, a correction, an answer to the user, or anything worth adding to the conversation.

Rules:
- Prefer silence over noise — if you have nothing substantial, say NO.
- But this is a group chat: if the user asked a question or invited everyone to speak, say YES.
- If the user is sharing their own experience or talking casually, respond like a friend in the group would — you do not need a formal reason to speak.

Respond with exactly one word: YES or NO`;

  try {
    await waitForRequestSlot();

    const model = createModelInstance(agent, ctx.config);

    const result = await runWithRetryBackoff(
      `gate check (${agent.name})`,
      ctx.orchestration,
      () => generateText({
        model,
        prompt: gatePrompt,
      }),
    );

    const decision = result.text.trim().toUpperCase().startsWith('YES')
      ? 'yes' as const
      : 'no' as const;

    return {
      agentId: agent.id,
      agentName: agent.name,
      decision,
      reason: result.text.trim(),
    };
  } catch (error) {
    console.warn(`[council:gate-check-failed] agent="${agent.name}" error="${error instanceof Error ? error.message : error}"`);
    return {
      agentId: agent.id,
      agentName: agent.name,
      decision: 'no',
      reason: 'Gate check failed',
    };
  }
}

/**
 * Generate an interjection from an agent that passed the gate check.
 * Returns the interjection text.
 */
async function generateInterjection(
  agent: AgentConfig,
  primaryAgentName: string,
  primaryResponse: string,
  ctx: OrchestratorContext,
  waitForRequestSlot: () => Promise<void>,
): Promise<string> {
  const interjectionPrompt = `You are ${agent.name}, a ${agent.role}.

You are interjecting into a conversation because you have something meaningful to add.

The primary agent (${primaryAgentName}) responded:
---
${primaryResponse}
---

Reply like a real person chatting in a group: casual tone, plain text, a few short sentences (under 80 words). Focus only on what the primary agent missed, got wrong, or what critical perspective you can add. Do not use markdown formatting (no lists, tables, headings, or bold). Do not repeat what was already said.`;

  // Build messages: the conversation so far + the interjection prompt
  const interjectionMessages: ModelMessage[] = [
    ...ctx.modelMessages,
    { role: 'user', content: interjectionPrompt },
  ];

  await waitForRequestSlot();

  const model = createModelInstance(agent, ctx.config);
  const providerOptions = getThinkingParams(agent);

  const result = await runWithRetryBackoff(
    `interjection (${agent.name})`,
    ctx.orchestration,
    () => generateText({
      model,
      system: agent.systemPrompt,
      messages: interjectionMessages,
      ...(Object.keys(providerOptions).length > 0
        ? { providerOptions: providerOptions as never }
        : {}),
    }),
  );

  return result.text;
}

/**
 * Write an interjection as data parts in the stream so the frontend can display it.
 */
function writeInterjection(
  writer: UIMessageStreamWriter,
  agent: AgentConfig,
  content: string,
): void {
  if (!content.trim()) return;
  writer.write({
    type: 'data-interjection',
    data: {
      agentId: agent.id,
      agentName: agent.name,
      agentRole: agent.role,
      agentAvatar: agent.avatar,
      agentColour: agent.colour,
      content,
    },
  });
}

/** Show an agent's failure as a visible block in the group chat. */
function writeAgentError(
  writer: UIMessageStreamWriter,
  agent: AgentConfig,
  error: string,
): void {
  writer.write({
    type: 'data-agent-error',
    data: {
      agentId: agent.id,
      agentName: agent.name,
      agentAvatar: agent.avatar,
      agentColour: agent.colour,
      error,
    },
  });
}

/**
 * Council mode: primary agent responds, then silent agents gate-check and optionally interject.
 */
export async function runCouncilMode(
  writer: UIMessageStreamWriter,
  ctx: OrchestratorContext,
): Promise<void> {
  const { config, sessionConfig, orchestration, mentionedAgentIds } = ctx;
  const waitForRequestSlot = createRequestPacer(orchestration);

  const primaryAgent = config.agents.find((a) => a.id === sessionConfig.primaryAgentId);
  if (!primaryAgent) {
    throw new Error('Primary agent not found');
  }

  // Compress long histories before any model calls
  const compressed = await compressContextIfNeeded(
    ctx.modelMessages,
    primaryAgent,
    config,
  );
  ctx.modelMessages = compressed.messages;

  writeResponseMetadata(writer, primaryAgent, sessionConfig.mode);

  // Phase 1: Stream primary agent response
  const primaryText = await streamPrimaryAgent(primaryAgent, ctx, writer, waitForRequestSlot);

  // Phase 2: Gate checks on silent agents.
  // Mentioned agents skip gate checks and get to speak first.
  const silentAgents = config.agents.filter(
    (a) => a.id !== sessionConfig.primaryAgentId && sessionConfig.agentIds.includes(a.id),
  );
  const mentionedAgents = silentAgents.filter((a) => mentionedAgentIds.includes(a.id));
  const unmentionedAgents = silentAgents.filter((a) => !mentionedAgentIds.includes(a.id));
  const orderedSilentAgents = [...mentionedAgents, ...unmentionedAgents];

  if (silentAgents.length === 0) {
    writeCouncilStatus(writer, {
      phase: 'done',
      pendingAgents: 0,
      totalAgents: 0,
      message: 'Response complete.',
    });
    return;
  }

  // Mentioned agents bypass gate checks entirely; unmentioned agents gate-check as usual.
  const gateResults: GateDecision[] = [];
  let pendingGateChecks = unmentionedAgents.length;

  if (unmentionedAgents.length > 0) {
    writeCouncilStatus(writer, {
      phase: 'gate-check',
      pendingAgents: pendingGateChecks,
      totalAgents: unmentionedAgents.length,
      message: `Other agents are reviewing the primary response (${pendingGateChecks} remaining).`,
    });
  }

  for (const agent of unmentionedAgents) {
    const result = await runGateCheck(
      agent,
      primaryAgent.name,
      primaryText,
      ctx,
      waitForRequestSlot,
    );
    gateResults.push(result);

    pendingGateChecks -= 1;
    writeCouncilStatus(writer, {
      phase: 'gate-check',
      pendingAgents: pendingGateChecks,
      totalAgents: unmentionedAgents.length,
      message:
        pendingGateChecks > 0
          ? `Other agents are still reviewing (${pendingGateChecks} remaining).`
          : 'Gate checks finished.',
    });
  }

  const approvedAgents: AgentConfig[] = [...mentionedAgents];
  for (let i = 0; i < gateResults.length; i++) {
    const result = gateResults[i];
    if (result.decision === 'yes') {
      approvedAgents.push(unmentionedAgents[i]);
    }
  }

  // Phase 3: Interjections (limited by maxInterjectionsPerMessage)
  const interjectingAgents = approvedAgents.slice(
    0,
    orchestration.maxInterjectionsPerMessage,
  );

  if (interjectingAgents.length > 0) {
    writeCouncilStatus(writer, {
      phase: 'interjections',
      pendingAgents: interjectingAgents.length,
      totalAgents: interjectingAgents.length,
      message: `Generating interjections from ${interjectingAgents.length} agent${interjectingAgents.length === 1 ? '' : 's'}...`,
    });
  }

  let pendingInterjections = interjectingAgents.length;

  for (const agent of interjectingAgents) {
    try {
      const interjectionText = await generateInterjection(
        agent,
        primaryAgent.name,
        primaryText,
        ctx,
        waitForRequestSlot,
      );
      writeInterjection(writer, agent, interjectionText);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[council:agent-failed] agent="${agent.name}" provider=${agent.providerId} model=${agent.modelId} phase=interjection error="${message}"`);
      writeAgentError(writer, agent, message);
    } finally {
      pendingInterjections -= 1;
      if (interjectingAgents.length > 0) {
        writeCouncilStatus(writer, {
          phase: 'interjections',
          pendingAgents: pendingInterjections,
          totalAgents: interjectingAgents.length,
          message:
            pendingInterjections > 0
              ? `Finalizing council response (${pendingInterjections} interjection${pendingInterjections === 1 ? '' : 's'} remaining).`
              : 'Council response complete.',
        });
      }
    }
  }

  writeCouncilStatus(writer, {
    phase: 'done',
    pendingAgents: 0,
    totalAgents: interjectingAgents.length,
    message: 'Response complete.',
  });
}

/**
 * Round robin mode: each agent responds in sequence.
 */
export async function runRoundRobinMode(
  writer: UIMessageStreamWriter,
  ctx: OrchestratorContext,
): Promise<void> {
  const { config, sessionConfig, orchestration, mentionedAgentIds } = ctx;
  const stickerToken = config.stickerSearch?.token;
  const waitForRequestSlot = createRequestPacer(orchestration);

  const activeAgents = config.agents.filter((a) =>
    sessionConfig.agentIds.includes(a.id),
  );
  // Mentioned agents respond first.
  const orderedAgents = [
    ...activeAgents.filter((a) => mentionedAgentIds.includes(a.id)),
    ...activeAgents.filter((a) => !mentionedAgentIds.includes(a.id)),
  ];

  if (orderedAgents.length === 0) {
    throw new Error('No agents configured');
  }

  // Compress long histories before any model calls
  const compressed = await compressContextIfNeeded(
    ctx.modelMessages,
    orderedAgents[0],
    config,
  );
  ctx.modelMessages = compressed.messages;

  // First agent streams directly
  const firstAgent = orderedAgents[0];
  writeResponseMetadata(writer, firstAgent, sessionConfig.mode);
  const firstText = await streamPrimaryAgent(firstAgent, ctx, writer, waitForRequestSlot);

  if (orderedAgents.length > 1) {
    writeCouncilStatus(writer, {
      phase: 'round-robin',
      pendingAgents: orderedAgents.length - 1,
      totalAgents: orderedAgents.length - 1,
      message: `Other agents are still preparing responses (${orderedAgents.length - 1} remaining).`,
    });
  }

  // Subsequent agents respond sequentially, each seeing all previous responses.
  const priorResponses: ModelMessage[] = [{ role: 'assistant', content: firstText }];
  let pendingAgents = orderedAgents.length - 1;
  for (let i = 1; i < orderedAgents.length; i++) {
    const agent = orderedAgents[i];
    try {
      await waitForRequestSlot();

      const model = createModelInstance(agent, ctx.config);
      const providerOptions = getThinkingParams(agent);

      const result = await runWithRetryBackoff(
        `round-robin response (${agent.name})`,
        ctx.orchestration,
        () => generateText({
          model,
          system: agent.systemPrompt,
          messages: [
            ...ctx.modelMessages,
            ...priorResponses,
            {
              role: 'user',
              content: `The previous agents have already responded. Now it is your turn as ${agent.name} (${agent.role}). Reply like a real person chatting in a group: casual tone, plain text, a few short sentences. Do not use markdown formatting (no lists, tables, headings, or bold). Do not repeat what others have said. IMPORTANT: speak ONLY as ${agent.name} — never write messages on behalf of other agents, never role-play other participants, never include other agents' names as headers. You can also use react_to_message to react with emoji to others' messages, or send_sticker for an emoji sticker.`,
            },
          ],
          tools: createReactionTools(agent.name, config.stickerSearch?.token),
          toolChoice: 'auto',
          ...(Object.keys(providerOptions).length > 0
            ? { providerOptions: providerOptions as never }
            : {}),
        }),
      );

      priorResponses.push({
        role: 'assistant',
        content: `${agent.name}（${agent.role}）: ${result.text}`,
      });
      writeInterjection(writer, agent, stripRolePlayedSpeakers(result.text, agent.name, ctx.config.agents));

      const roundRobinReactions = extractReactionCalls(result);
      for (const call of roundRobinReactions) {
        if (call.kind === 'sticker') {
          writeSticker(writer, agent, call.emoji);
        } else if (call.kind === 'sticker-image') {
          if (stickerToken) {
            const imageUrl = await searchStickerImage(call.query, stickerToken);
            if (imageUrl) {
              writeStickerImage(writer, agent, imageUrl, call.query);
            } else {
              writeSticker(writer, agent, '🤣');
            }
          }
        } else {
          writeInterjectionReaction(writer, call.emoji, agent, call.target);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[council:agent-failed] agent="${agent.name}" provider=${agent.providerId} model=${agent.modelId} phase=round-robin error="${message}"`);
      writeAgentError(writer, agent, message);
    } finally {
      pendingAgents -= 1;
      if (orderedAgents.length > 1) {
        writeCouncilStatus(writer, {
          phase: 'round-robin',
          pendingAgents,
          totalAgents: activeAgents.length - 1,
          message:
            pendingAgents > 0
              ? `Other agents are still preparing responses (${pendingAgents} remaining).`
              : 'Response complete.',
        });
      }
    }
  }

  writeCouncilStatus(writer, {
    phase: 'done',
    pendingAgents: 0,
    totalAgents: Math.max(0, orderedAgents.length - 1),
    message: 'Response complete.',
  });
}

/**
 * Free chat mode: no primary agent. After the user posts a message, ask
 * members who wants to speak (gate check); whoever has something to say
 * responds, their reply joins the context, and the loop repeats until no
 * one wants to speak or the round limit is reached.
 */
export async function runFreeChatMode(
  writer: UIMessageStreamWriter,
  ctx: OrchestratorContext,
): Promise<void> {
  const { config, sessionConfig, orchestration, mentionedAgentIds } = ctx;
  const stickerToken = config.stickerSearch?.token;
  const waitForRequestSlot = createRequestPacer(orchestration);

  const members = config.agents.filter((a) =>
    sessionConfig.agentIds.includes(a.id),
  );
  if (members.length === 0) {
    throw new Error('No agents configured');
  }

  // Compress long histories before any model calls
  const compressed = await compressContextIfNeeded(
    ctx.modelMessages,
    members[0],
    config,
  );
  ctx.modelMessages = compressed.messages;

  // Snapshot of the first member for message metadata (no primary in this mode,
  // but the frontend expects the metadata shape).
  writeResponseMetadata(writer, members[0], sessionConfig.mode);

  // Free-chat waves keep going until the accumulated discussion exceeds a
  // token budget (instead of a fixed round count), so long interesting
  // discussions are not cut off arbitrarily.
  const FREE_CHAT_TOKEN_BUDGET = 6000;
  // Safety cap: hard stop after this many rounds even if under budget.
  const MAX_ROUNDS = 12;

  // Transcripts accumulate each spoken turn so the next speaker sees them.
  const transcript: ModelMessage[] = [];
  const latestUserText = [...ctx.modelMessages]
    .reverse()
    .find((m) => m.role === 'user');
  const latestUserContent = latestUserText && typeof latestUserText.content === 'string'
    ? latestUserText.content
    : '';
  const speakersSoFar = new Set<string>();
  let spokeThisTurn = 0;

  const drainInjected = (): string[] => {
    const injected = consumePendingUserMessages(sessionConfig.conversationId ?? '');
    for (const text of injected) {
      transcript.push({ role: 'user', content: text });
      ctx.modelMessages.push({ role: 'user', content: text });
    }
    return injected;
  };

  const buildCheckContext = (highlightNewUserMessage: boolean): string => {
    const recent = transcript
      .slice(-10)
      .map((m) => (m.role === 'user' ? `用户: ${m.content}` : String(m.content)))
      .join('\n\n');
    const lastUser = [...transcript].reverse().find((m) => m.role === 'user');
    const lastUserContent = lastUser && typeof lastUser.content === 'string' ? lastUser.content : '';
    const tail = lastUserContent
      ? `${recent}\n\n---\n\n最新消息: ${lastUserContent}`
      : recent || latestUserContent;
    return highlightNewUserMessage && lastUserContent
      ? `最近讨论:\n\n${recent || '(还没有讨论)'}\n\n---\n\n用户刚发来新消息: ${lastUserContent}`
      : tail;
  };

  for (let round = 0; round < MAX_ROUNDS; round++) {
    // Stop the wave when the accumulated discussion exceeds the token budget.
    if (estimateTokens(transcript) >= FREE_CHAT_TOKEN_BUDGET) break;

    // Ask every member who has not spoken this round whether they want to speak.
    const candidates = members.filter((a) => !speakersSoFar.has(a.id) || round > 0);
    if (candidates.length === 0) break;

    writeCouncilStatus(writer, {
      phase: 'gate-check',
      pendingAgents: candidates.length,
      totalAgents: candidates.length,
      message: `Checking who wants to speak (round ${round + 1})...`,
    });

    // One gate check at a time, with a human-paced pause between each —
    // a user message injected during a pause gets picked up immediately.
    const speakers: AgentConfig[] = [];
    for (const agent of candidates) {
      await new Promise((r) => setTimeout(r, 3000 + Math.floor(Math.random() * 5000)));
      const injected = drainInjected();
      if (injected.length > 0) {
        // A new user message just arrived: restart the round so every member
        // re-checks against the freshest context including the new message.
        round -= 1;
        break;
      }

      const checkContext = buildCheckContext(false);
      const decision = await runGateCheck(
        agent,
        'GROUP_CHAT',
        checkContext,
        ctx,
        waitForRequestSlot,
      );
      if (decision.decision === 'yes') {
        speakers.push(agent);

        try {
          await waitForRequestSlot();

          const model = createModelInstance(agent, ctx.config);
          const providerOptions = getThinkingParams(agent);

          const result = await runWithRetryBackoff(
            `free-chat response (${agent.name})`,
            ctx.orchestration,
            () => generateText({
              model,
              system: agent.systemPrompt,
              messages: [
                ...ctx.modelMessages,
                ...transcript,
                {
                  role: 'user',
                  content: `You are ${agent.name} (${agent.role}) chatting in a group. The conversation so far is above — the latest user message is what everyone is reacting to. Speak like a real person chatting in a group: casual tone, plain text, a few short sentences. Do not use markdown formatting (no lists, tables, headings, or bold). Do not repeat what others have said. IMPORTANT: speak ONLY as ${agent.name} — never write messages on behalf of other agents, never role-play other participants. Others may also reply after you, so leave room for them — do not conclude the whole discussion. You can also use the react_to_message tool to react with emoji to others' messages, or send_sticker to send an emoji sticker — use them naturally like real people do, but do not overuse them.`,
                },
              ],
              tools: createReactionTools(agent.name, config.stickerSearch?.token),
              toolChoice: 'auto',
              ...(Object.keys(providerOptions).length > 0
                ? { providerOptions: providerOptions as never }
                : {}),
            }),
          );

          const text = stripRolePlayedSpeakers(result.text, agent.name, ctx.config.agents);
          if (text) {
            transcript.push({
              role: 'assistant',
              content: `${agent.name}（${agent.role}）: ${text}`,
            });
            speakersSoFar.add(agent.id);
            spokeThisTurn += 1;
            writeInterjection(writer, agent, text);
          }

          // Emoji reactions and standalone stickers from tool calls.
          const reactionCalls = extractReactionCalls(result);
          for (const call of reactionCalls) {
            if (call.kind === 'sticker') {
              writeSticker(writer, agent, call.emoji);
            } else if (call.kind === 'sticker-image') {
              if (stickerToken) {
                const imageUrl = await searchStickerImage(call.query, stickerToken);
                if (imageUrl) {
                  writeStickerImage(writer, agent, imageUrl, call.query);
                } else {
                  writeSticker(writer, agent, '🤣');
                }
              }
            } else {
              // Attach as a reaction to the most recent assistant interjection
              // in the stream (the frontend matches by data part order).
              writeInterjectionReaction(writer, call.emoji, agent, call.target);
            }
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.warn(`[council:agent-failed] agent="${agent.name}" provider=${agent.providerId} model=${agent.modelId} phase=free-chat error="${message}"`);
          writeAgentError(writer, agent, message);
        }
      }
    }

    // Nobody managed to speak and no one wants to — end the loop.
    if (spokeThisTurn === 0 && speakers.length === 0 && round > 0) break;
  }

  if (spokeThisTurn === 0) {
    const id = nanoid();
    writer.write({ type: 'text-start', id });
    writer.write({ type: 'text-delta', id, delta: '（本次没有成员想发言）' });
    writer.write({ type: 'text-end', id });
  }

  writeCouncilStatus(writer, {
    phase: 'done',
    pendingAgents: 0,
    totalAgents: spokeThisTurn,
    message: 'Response complete.',
  });
}
