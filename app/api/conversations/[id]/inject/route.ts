import { addPendingUserMessage, type PendingAttachment } from '@/lib/orchestrator/pending-messages';
import { updateConversation } from '@/lib/storage/conversation-store';

/** Largest single attachment we are willing to inline into a conversation
 * file (data URLs are stored with the message, and every poll downloads the
 * whole conversation). */
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

function toAttachments(value: unknown): PendingAttachment[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const record = entry as { url?: unknown; mediaType?: unknown; filename?: unknown };
    if (typeof record.url !== 'string' || !record.url.startsWith('data:')) return [];
    if (record.url.length > MAX_ATTACHMENT_BYTES) return [];
    return [
      {
        url: record.url,
        mediaType:
          typeof record.mediaType === 'string' && record.mediaType
            ? record.mediaType
            : 'application/octet-stream',
        ...(typeof record.filename === 'string' && record.filename
          ? { filename: record.filename }
          : {}),
      },
    ];
  });
}

/** Inject a mid-discussion user message into a running free-chat wave. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  const attachments = toAttachments(body?.files);

  if (!text && attachments.length === 0) {
    return Response.json({ error: 'text required' }, { status: 400 });
  }

  addPendingUserMessage(id, { text, ...(attachments.length > 0 ? { files: attachments } : {}) });

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
        parts: [
          ...(text ? [{ type: 'text', text }] : []),
          ...attachments.map((file) => ({
            type: 'file',
            url: file.url,
            mediaType: file.mediaType,
            ...(file.filename ? { filename: file.filename } : {}),
          })),
        ],
      } as never);
    }
  });

  return Response.json({ ok: true });
}
