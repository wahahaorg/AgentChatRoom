import { NextResponse } from 'next/server';
import {
  getConversation,
  saveConversation,
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
  const conversation = await getConversation(id);
  if (!conversation) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const body = await request.json();
  const { title, mode, primaryAgentId, agentIds, messages } = body as Partial<{
    title: string;
    mode: string;
    primaryAgentId: string;
    agentIds: string[];
    messages: unknown[];
  }>;

  if (title !== undefined) conversation.title = title;
  if (mode !== undefined) conversation.mode = mode as typeof conversation.mode;
  if (primaryAgentId !== undefined) conversation.primaryAgentId = primaryAgentId;
  if (agentIds !== undefined) conversation.agentIds = agentIds;
  if (messages !== undefined) {
    // Merge by message id instead of overwriting: in group chats multiple
    // clients save their own view of the conversation, and a blind overwrite
    // would drop messages saved by other participants.
    const byId = new Map<string, unknown>();
    for (const m of conversation.messages) {
      byId.set((m as { id: string }).id, m);
    }
    for (const m of messages) {
      byId.set((m as { id: string }).id, m);
    }
    const merged = [...byId.values()];
    // Preserve conversation order (by first appearance) — sort merged by
    // createdAt-ish order is unreliable; keep insertion order of stored first
    // then append new ones.
    conversation.messages = merged as typeof conversation.messages;
  }
  conversation.updatedAt = new Date().toISOString();

  await saveConversation(conversation);
  return NextResponse.json(conversation);
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
