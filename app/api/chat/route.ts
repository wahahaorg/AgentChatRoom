import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
  type UIMessageStreamWriter,
} from 'ai';
import { readConfig } from '@/lib/storage/config-store';
import { runCouncilMode, runRoundRobinMode, runFreeChatMode } from '@/lib/orchestrator/council-orchestrator';
import type { SessionConfig } from '@/lib/types/council';

interface CouncilStatusData {
  phase: 'gate-check' | 'interjections' | 'round-robin' | 'done';
  pendingAgents: number;
  totalAgents: number;
  message: string;
}

function hasModelUsableContent(message: UIMessage): boolean {
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

function sanitizeIncomingMessages(messages: UIMessage[]): UIMessage[] {
  return messages.filter((message) => {
    if (message.role !== 'assistant') return true;
    return hasModelUsableContent(message);
  });
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
  const body = await request.json();
  const { messages, sessionConfig, mentionedAgentIds, conversationId } = body as {
    messages: UIMessage[];
    sessionConfig: SessionConfig;
    mentionedAgentIds?: string[];
    conversationId?: string;
  };

  const sanitizedMessages = sanitizeIncomingMessages(messages ?? []);
  const modelMessages = await convertToModelMessages(sanitizedMessages);
  const config = await readConfig();

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      try {
        const ctx = {
          config,
          sessionConfig: { ...sessionConfig, conversationId },
          modelMessages,
          orchestration: config.orchestration,
          mentionedAgentIds: mentionedAgentIds ?? [],
        };

        if (sessionConfig.mode === 'round-robin') {
          await runRoundRobinMode(writer, ctx);
        } else if (sessionConfig.mode === 'free-chat') {
          await runFreeChatMode(writer, ctx);
        } else {
          await runCouncilMode(writer, ctx);
        }
      } catch (error) {
        console.error('Council orchestrator error:', error);
        writeAssistantError(writer, toUserFacingErrorMessage(error));
        writeDoneStatus(writer);
      }
    },
    onError: (error) => {
      console.error('Council stream error:', error);
      return 'An unexpected stream error occurred.';
    },
  });

  return createUIMessageStreamResponse({ stream });
}
