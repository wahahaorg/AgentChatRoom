/**
 * In-memory queue of user messages injected into a running free-chat wave.
 * Keyed by conversation id; the orchestrator drains it between rounds so
 * mid-discussion user messages join the live context instead of waiting
 * for the wave to end.
 */
const pending = new Map<string, string[]>();

export function addPendingUserMessage(conversationId: string, text: string): void {
  const list = pending.get(conversationId) ?? [];
  list.push(text);
  pending.set(conversationId, list);
}

export function consumePendingUserMessages(conversationId: string): string[] {
  const list = pending.get(conversationId);
  pending.delete(conversationId);
  return list ?? [];
}
