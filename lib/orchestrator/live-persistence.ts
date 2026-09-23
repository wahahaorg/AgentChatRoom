import { getConversation, saveConversation } from '@/lib/storage/conversation-store';
import type { SessionConfig } from '@/lib/types/council';

/**
 * Server-side live conversation persistence: during a streaming wave the
 * orchestrator appends each emitted message part here, and the parts are
 * flushed into the conversation file on disk. This keeps the stored
 * conversation in sync for all viewers, independent of any client saving.
 */

interface LiveWave {
  /** The assistant UIMessage parts emitted so far in this wave. */
  parts: unknown[];
  dirty: boolean;
}

const liveWaves = new Map<string, LiveWave>();

export async function startLiveWave(
  conversationId: string,
  sessionConfig: SessionConfig,
): Promise<void> {
  const existing = await getConversation(conversationId);
  if (existing) {
    liveWaves.set(conversationId, { parts: [], dirty: false });
    return;
  }
  // New conversation — create the record with metadata now.
  const now = new Date().toISOString();
  await saveConversation({
    id: conversationId,
    title: sessionConfig.mode === 'free-chat' ? '新群聊' : '新对话',
    mode: sessionConfig.mode,
    primaryAgentId: sessionConfig.primaryAgentId ?? '',
    agentIds: sessionConfig.agentIds,
    messages: [],
    createdAt: now,
    updatedAt: now,
  });
  liveWaves.set(conversationId, { parts: [], dirty: false });
}

/** Append an emitted data/text part to the live wave and flush immediately
 * so polling viewers see it within seconds, not only when the wave ends. */
export function appendLivePart(conversationId: string, part: unknown): void {
  const wave = liveWaves.get(conversationId);
  if (!wave) return;
  wave.parts.push(part);
  wave.dirty = true;
  // Fire-and-forget flush; errors are non-fatal.
  void flushLiveWave(conversationId).catch(() => {});
}

/** Flush accumulated parts into the conversation file. */
export async function flushLiveWave(conversationId: string): Promise<void> {
  const wave = liveWaves.get(conversationId);
  if (!wave || !wave.dirty) return;

  const conv = await getConversation(conversationId);
  if (conv) {
    const last = conv.messages[conv.messages.length - 1] as
      | { id?: string; parts?: unknown[] }
      | undefined;
    const waveMessageId = `wave-${conversationId}`;
    if (last && last.id === waveMessageId) {
      // Continue appending to the current wave's message.
      last.parts = [...(last.parts ?? []), ...wave.parts];
    } else {
      conv.messages.push({
        id: waveMessageId,
        role: 'assistant',
        parts: [...wave.parts],
      });
    }
    conv.updatedAt = new Date().toISOString();
    await saveConversation(conv);
  }
  wave.parts = [];
  wave.dirty = false;
}

export function endLiveWave(conversationId: string): void {
  liveWaves.delete(conversationId);
}

/** Persist the live orchestration status so polling viewers (other tabs)
 * see "agent is deciding whether to speak..." too. */
export async function setLiveStatus(
  conversationId: string,
  message: string | null,
): Promise<void> {
  const conv = await getConversation(conversationId);
  if (!conv) return;
  conv.liveStatus = message
    ? { message, updatedAt: new Date().toISOString() }
    : null;
  conv.updatedAt = new Date().toISOString();
  await saveConversation(conv);
}
