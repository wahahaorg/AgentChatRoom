import { NextResponse } from 'next/server';
import {
  getConversation,
  updateConversation,
  deleteConversation,
} from '@/lib/storage/conversation-store';

/** GET /api/conversations/:id — get a single conversation with messages */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const conversation = await getConversation(id);
  if (!conversation) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json(conversation);
}

/** PUT /api/conversations/:id — update conversation metadata.
 *
 * Messages are deliberately NOT writable here: user messages are persisted by
 * the chat route and assistant output by live persistence, both under the
 * store lock. A client-side message save would let one viewer's stale local
 * view overwrite newer server content.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const { title, mode, primaryAgentId, agentIds } = body as Partial<{
    title: string;
    mode: string;
    primaryAgentId: string;
    agentIds: string[];
  }>;

  // Read-modify-write under the store lock.
  const updated = await updateConversation(id, (conversation) => {
    if (title !== undefined) conversation.title = title;
    if (mode !== undefined) conversation.mode = mode as typeof conversation.mode;
    if (primaryAgentId !== undefined) conversation.primaryAgentId = primaryAgentId;
    if (agentIds !== undefined) conversation.agentIds = agentIds;
  });

  if (!updated) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json(updated);
}

/** DELETE /api/conversations/:id — delete a conversation */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const deleted = await deleteConversation(id);
  if (!deleted) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
