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

/** PUT /api/conversations/:id — update conversation metadata or messages */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const { title, mode, primaryAgentId, agentIds, messages } = body as Partial<{
    title: string;
    mode: string;
    primaryAgentId: string;
    agentIds: string[];
    messages: unknown[];
  }>;

  // Read-modify-write under the store lock: a blind overwrite would drop
  // messages that a running wave appended in the meantime.
  const updated = await updateConversation(id, (conversation) => {
    if (title !== undefined) conversation.title = title;
    if (mode !== undefined) conversation.mode = mode as typeof conversation.mode;
    if (primaryAgentId !== undefined) conversation.primaryAgentId = primaryAgentId;
    if (agentIds !== undefined) conversation.agentIds = agentIds;

    if (messages !== undefined) {
      // Merge by message id instead of overwriting: in group chats multiple
      // clients save their own view of the conversation, and a blind overwrite
      // would drop messages saved by other participants or by the server.
      const byId = new Map<string, unknown>();
      for (const message of conversation.messages) {
        byId.set((message as { id: string }).id, message);
      }
      for (const message of messages) {
        const messageId = (message as { id?: string })?.id;
        // A message without an id cannot be matched against a stored one, and
        // using '' as the key would make every id-less message overwrite the
        // previous one. Keep those instead of dropping them.
        if (!messageId) {
          conversation.messages.push(message as never);
          continue;
        }
        const stored = byId.get(messageId) as { parts?: unknown[] } | undefined;
        const incoming = message as { parts?: unknown[] };
        // Parts are append-only: never replace a richer stored version with a
        // shorter one from a client that has not caught up yet.
        if (stored && (stored.parts?.length ?? 0) > (incoming.parts?.length ?? 0)) {
          continue;
        }
        byId.set(messageId, message);
      }
      conversation.messages = [...byId.values()] as typeof conversation.messages;
    }

    return conversation;
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
