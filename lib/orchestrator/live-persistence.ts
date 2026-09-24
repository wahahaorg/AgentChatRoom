import { getConversation, saveConversation, updateConversation } from '@/lib/storage/conversation-store';
import type { SessionConfig } from '@/lib/types/council';

/**
 * Server-side live conversation persistence: during a streaming wave the
 * orchestrator hands every emitted message part to this module, and the parts
 * are appended to the conversation file.
 *
 * Two properties matter:
 *  1. The wave message is stored under the SAME id the stream announced for it
 *     (see writeResponseMetadata), so a second viewer polling the conversation
 *     recognises it as the message it already displays instead of adding a
 *     duplicate of the whole wave.
 *  2. Appends are atomic read-modify-writes (updateConversation), so an agent
 *     message can never be clobbered by a concurrent status update.
 */

interface LiveWave {
  /** Id of the assistant message this wave writes into. */
  messageId: string;
  /** Metadata copied onto the stored message (primary agent, mode). */
  metadata: unknown;
  /** Parts emitted so far but not yet flushed to disk. */
  parts: unknown[];
  dirty: boolean;
}

const liveWaves = new Map<string, LiveWave>();
const flushTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Coalesce rapid part emissions into a single file write. */
const FLUSH_INTERVAL_MS = 250;

function cancelScheduledFlush(conversationId: string): void {
  const timer = flushTimers.get(conversationId);
  if (timer) {
    clearTimeout(timer);
    flushTimers.delete(conversationId);
  }
}

function scheduleFlush(conversationId: string): void {
  if (flushTimers.has(conversationId)) return;
  const timer = setTimeout(() => {
    flushTimers.delete(conversationId);
    void flushLiveWave(conversationId).catch(() => {});
  }, FLUSH_INTERVAL_MS);
  // Don't hold the process open for a pending flush.
  if (typeof timer.unref === 'function') timer.unref();
  flushTimers.set(conversationId, timer);
}

export interface LiveWaveOptions {
  /** Id of the assistant message the stream announced for this wave. */
  messageId: string;
  /** Metadata to store on the message so a reload renders the right author. */
  metadata?: unknown;
}

export async function startLiveWave(
  conversationId: string,
  sessionConfig: SessionConfig,
  options: LiveWaveOptions,
): Promise<void> {
  // Two viewers can start a wave for the same conversation at almost the same
  // moment. The map holds one wave per conversation, so replacing it blindly
  // would drop whatever the previous wave had buffered but not yet flushed.
  if (liveWaves.has(conversationId)) {
    await finishLiveWave(conversationId);
  }

  const existing = await getConversation(conversationId);
  if (!existing) {
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
  }
  liveWaves.set(conversationId, {
    messageId: options.messageId,
    metadata: options.metadata,
    parts: [],
    dirty: false,
  });
}

/** Buffer a part for the next flush. */
export function appendLivePart(conversationId: string, part: unknown): void {
  const wave = liveWaves.get(conversationId);
  if (!wave) return;
  wave.parts.push(part);
  wave.dirty = true;
  scheduleFlush(conversationId);
}

/** Flush buffered parts into the conversation file. */
export async function flushLiveWave(conversationId: string): Promise<void> {
  cancelScheduledFlush(conversationId);

  const wave = liveWaves.get(conversationId);
  if (!wave || !wave.dirty) return;

  // Take ownership of the buffered parts BEFORE awaiting anything: a concurrent
  // append (or a second flush) must never re-write the same parts twice.
  const parts = wave.parts;
  wave.parts = [];
  wave.dirty = false;
  if (parts.length === 0) return;

  const { messageId, metadata } = wave;

  try {
    const appended = await updateConversation(conversationId, (conversation) => {
      const existing = conversation.messages.find(
        (message) => (message as { id?: string })?.id === messageId,
      ) as { parts?: unknown[] } | undefined;

      if (existing) {
        existing.parts = [...(existing.parts ?? []), ...parts];
        return true;
      }

      conversation.messages.push({
        id: messageId,
        role: 'assistant',
        ...(metadata ? { metadata } : {}),
        parts: [...parts],
      });
      return true;
    });

    // null => the conversation was deleted while the wave was running.
    if (appended === null) liveWaves.delete(conversationId);
  } catch (error) {
    // Keep the parts so the next flush retries instead of dropping them.
    wave.parts = [...parts, ...wave.parts];
    wave.dirty = true;
    scheduleFlush(conversationId);
    throw error;
  }
}

export function endLiveWave(conversationId: string): void {
  cancelScheduledFlush(conversationId);
  liveWaves.delete(conversationId);
}

/** Flush what's left, then drop the wave. Safe to call more than once. */
export async function finishLiveWave(conversationId: string): Promise<void> {
  try {
    await flushLiveWave(conversationId);
  } catch {
    // A failed final flush must not mask the orchestrator's own result.
  }
  endLiveWave(conversationId);
}

/** Persist the live orchestration status so polling viewers (other tabs)
 * see "agent is deciding whether to speak..." too. */
export async function setLiveStatus(
  conversationId: string,
  message: string | null,
): Promise<void> {
  await updateConversation(conversationId, (conversation) => {
    conversation.liveStatus = message
      ? { message, updatedAt: new Date().toISOString() }
      : null;
  });
}
