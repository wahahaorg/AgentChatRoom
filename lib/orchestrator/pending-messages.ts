/**
 * In-memory queue of user messages injected into a running free-chat wave.
 * Keyed by conversation id; the orchestrator drains it between rounds so
 * mid-discussion user messages join the live context instead of waiting
 * for the wave to end.
 */

/** An attachment carried on an injected message, as a data URL. */
export interface PendingAttachment {
  url: string;
  mediaType: string;
  filename?: string;
}

export interface PendingUserMessage {
  text: string;
  /** Attachments, so a mid-discussion message does not lose its files. */
  files?: PendingAttachment[];
}

const pending = new Map<string, PendingUserMessage[]>();

export function addPendingUserMessage(
  conversationId: string,
  message: PendingUserMessage,
): void {
  const list = pending.get(conversationId) ?? [];
  list.push(message);
  pending.set(conversationId, list);
}

export function consumePendingUserMessages(conversationId: string): PendingUserMessage[] {
  const list = pending.get(conversationId);
  pending.delete(conversationId);
  return list ?? [];
}
