import { addPendingUserMessage } from '@/lib/orchestrator/pending-messages';

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
  return Response.json({ ok: true });
}
