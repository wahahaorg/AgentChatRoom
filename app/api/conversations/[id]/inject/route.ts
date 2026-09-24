import { addPendingUserMessage } from '@/lib/orchestrator/pending-messages';
import { updateConversation } from '@/lib/storage/conversation-store';

/** Inject a mid-discussion user message into a running free-chat wave. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const text = typeof body?.text === 'string' ? body.text.trim() : '';

  if (!text) {
    return Response.json({ error: 'text required' }, { status: 400 });
  }

  addPendingUserMessage(id, text);

  // Persist the injected message server-side so all viewers (and refreshes)
  // see it — the chat route does the same for normal user messages. Uses the
  // client's message id so the polling viewer dedupes instead of showing it
  // twice. No-op when the conversation is gone.
  const clientId = typeof body?.clientId === 'string' && body.clientId
    ? body.clientId
    : `injected-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  await updateConversation(id, (conversation) => {
    const stored = conversation.messages.some(
      (message) => (message as { id?: string })?.id === clientId,
    );
    if (!stored) {
      conversation.messages.push({
        id: clientId,
        role: 'user',
        parts: [{ type: 'text', text }],
      });
    }
  });

  return Response.json({ ok: true });
}
