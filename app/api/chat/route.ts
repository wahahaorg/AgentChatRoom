import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
  type UIMessageStreamWriter,
} from 'ai';
import { readConfig } from '@/lib/storage/config-store';
import { upsertMessage } from '@/lib/storage/conversation-store';
import {
  runCouncilMode,
  runRoundRobinMode,
  runFreeChatMode,
  isAbortError,
} from '@/lib/orchestrator/council-orchestrator';
import { buildModelMessages, sanitizeIncomingMessages } from '@/lib/orchestrator/model-context';
import type { SessionConfig } from '@/lib/types/council';

interface CouncilStatusData {
  phase: 'gate-check' | 'interjections' | 'round-robin' | 'done';
  pendingAgents: number;
  totalAgents: number;
  message: string;
}

/** Title for a conversation created as a fallback (client create call failed). */
function toConversationTitle(message: UIMessage): string {
  const text = (message.parts ?? [])
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) return 'New Chat';
  return text.length <= 50 ? text : `${text.slice(0, 47)}...`;
}

function toUserFacingErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? 'Unknown error');
  const firstLine = raw.split('\n').map((line) => line.trim()).find(Boolean) ?? 'Unknown error';
  const normalized = raw.toLowerCase();

  if (normalized.includes('quota exceeded')) {
    return 'Google API quota exceeded for the selected model. Switch the primary agent to a free-tier model (for example Gemini 2.5 Flash or Gemini 2.5 Flash Lite), or wait for quota reset.';
  }

  if (
    normalized.includes('is not found for api version') ||
    normalized.includes('not supported for generatecontent')
  ) {
    return 'The selected model is not available for this Google API key/version. Open Settings and re-select a supported model.';
  }

  if (normalized.includes('no output generated')) {
    return 'The selected model did not return output. This is often caused by quota limits or model access restrictions. Switch the primary agent to Gemini 2.5 Flash/Flash Lite, or wait for quota reset.';
  }

  if (normalized.includes('no api key configured')) {
    return firstLine;
  }

  return `Chat request failed: ${firstLine}`;
}

function writeAssistantError(writer: UIMessageStreamWriter, message: string): void {
  const id = `error-${Date.now().toString(36)}`;
  writer.write({ type: 'text-start', id });
  writer.write({ type: 'text-delta', id, delta: `Error: ${message}` });
  writer.write({ type: 'text-end', id });
}

function writeDoneStatus(writer: UIMessageStreamWriter): void {
  const status: CouncilStatusData = {
    phase: 'done',
    pendingAgents: 0,
    totalAgents: 0,
    message: 'Response complete.',
  };

  writer.write({
    type: 'data-council-status',
    data: status,
    transient: true,
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return new Response('Invalid JSON body', { status: 400 });
  }

  const { messages, sessionConfig, mentionedAgentIds, conversationId } = body as {
    messages: UIMessage[];
    sessionConfig: SessionConfig;
    mentionedAgentIds?: string[];
    conversationId?: string;
  };

  if (!sessionConfig?.mode) {
    return new Response('sessionConfig is required', { status: 400 });
  }

  const sanitizedMessages = sanitizeIncomingMessages(messages ?? []);
  const modelMessages = await buildModelMessages(sanitizedMessages);
  const config = await readConfig();

  // Persist the latest user message server-side (single AI SDK id, deduped)
  // so refreshes and other viewers of the conversation see it. The conversation
  // is created here if the client's create call never landed, so a wave can
  // never run against an id that has no stored user message.
  const lastUserMessage = [...sanitizedMessages].reverse().find((m) => m.role === 'user');
  if (conversationId && lastUserMessage) {
    const now = new Date().toISOString();
    await upsertMessage(
      {
        id: conversationId,
        title: toConversationTitle(lastUserMessage),
        mode: sessionConfig.mode,
        primaryAgentId: sessionConfig.primaryAgentId ?? '',
        agentIds: sessionConfig.agentIds ?? [],
        messages: [],
        createdAt: now,
        updatedAt: now,
      },
      lastUserMessage,
    );
  }

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      try {
        const ctx = {
          config,
          sessionConfig: { ...sessionConfig, conversationId },
          modelMessages,
          orchestration: config.orchestration,
          mentionedAgentIds: mentionedAgentIds ?? [],
          // The viewer closing the tab (or pressing stop) aborts in-flight
          // model calls; everything produced so far is already persisted.
          abortSignal: request.signal,
        };

        if (sessionConfig.mode === 'round-robin') {
          await runRoundRobinMode(writer, ctx);
        } else if (sessionConfig.mode === 'free-chat') {
          await runFreeChatMode(writer, ctx);
        } else {
          await runCouncilMode(writer, ctx);
        }
      } catch (error) {
        try {
          if (!isAbortError(error)) {
            console.error('Council orchestrator error:', error);
            writeAssistantError(writer, toUserFacingErrorMessage(error));
          }
          writeDoneStatus(writer);
        } catch {
          // The stream is already gone — the conversation file holds the result.
        }
      }
    },
    onError: (error) => {
      console.error('Council stream error:', error);
      return 'An unexpected stream error occurred.';
    },
  });

  return createUIMessageStreamResponse({ stream });
}
