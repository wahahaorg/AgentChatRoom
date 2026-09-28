import { promises as fs } from 'fs';
import path from 'path';
import type { Conversation, ConversationSummary } from '@/lib/types/council';

const CONVERSATIONS_DIR = path.join(process.cwd(), '.council', 'conversations');

/**
 * Every mutation of a conversation file runs through a per-conversation lock
 * that covers BOTH the read and the write.
 *
 * The previous version only chained the writes while each caller still read its
 * own snapshot first, so two concurrent read-modify-write cycles (a
 * live-persistence flush appending agent messages and setLiveStatus touching
 * the same file) silently clobbered each other: whichever wrote last wrote its
 * stale snapshot over the other's changes, dropping interjections from the
 * conversation file.
 */
const locks = new Map<string, Promise<void>>();

function ignore(): void {}

/** Serialize `run` behind any in-flight operation for the same conversation. */
function withConversationLock<T>(id: string, run: () => Promise<T>): Promise<T> {
  const previous = locks.get(id) ?? Promise.resolve();
  // Run after the previous task settles — even if it failed. Otherwise one
  // rejected write would permanently break every later write for this id.
  const task = previous.then(run, run);
  // The tail never rejects, so it can be safely chained from.
  const tail = task.then(ignore, ignore);
  locks.set(id, tail);
  void tail.then(() => {
    if (locks.get(id) === tail) locks.delete(id);
  });
  return task;
}

async function ensureDir() {
  await fs.mkdir(CONVERSATIONS_DIR, { recursive: true });
}

function conversationPath(id: string): string {
  return path.join(CONVERSATIONS_DIR, `${id}.json`);
}

export async function listConversations(): Promise<ConversationSummary[]> {
  await ensureDir();

  let files: string[];
  try {
    files = await fs.readdir(CONVERSATIONS_DIR);
  } catch {
    return [];
  }

  const summaries: ConversationSummary[] = [];

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    try {
      const raw = await fs.readFile(path.join(CONVERSATIONS_DIR, file), 'utf-8');
      const conv = JSON.parse(raw) as Conversation;
      summaries.push({
        id: conv.id,
        title: conv.title,
        mode: conv.mode,
        messageCount: conv.messages.length,
        updatedAt: conv.updatedAt,
      });
    } catch {
      // Skip corrupt files
    }
  }

  // Most recently updated first
  summaries.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return summaries;
}

/** Lock-free read: writes are atomic renames, so readers always see a
 * complete file (either the old or the new version). */
export async function getConversation(id: string): Promise<Conversation | null> {
  try {
    const raw = await fs.readFile(conversationPath(id), 'utf-8');
    return JSON.parse(raw) as Conversation;
  } catch {
    return null;
  }
}

async function writeConversationFile(conversation: Conversation): Promise<void> {
  await ensureDir();
  const finalPath = conversationPath(conversation.id);
  const tmpPath = `${finalPath}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    await fs.writeFile(tmpPath, JSON.stringify(conversation, null, 2), 'utf-8');
    // Atomic on POSIX: readers see either the old or the new complete file.
    await fs.rename(tmpPath, finalPath);
  } catch (err) {
    await fs.unlink(tmpPath).catch(() => {});
    throw err;
  }
}

/** Blind overwrite, serialized with every other operation on this id. */
export async function saveConversation(conversation: Conversation): Promise<void> {
  await withConversationLock(conversation.id, () => writeConversationFile(conversation));
}

/**
 * Atomic read-modify-write. The lock is held across the read, so the mutator
 * always works on the latest state and concurrent updates cannot be lost.
 * Returns null when the conversation no longer exists.
 */
export async function updateConversation<T>(
  id: string,
  mutate: (conversation: Conversation) => T | Promise<T>,
): Promise<T | null> {
  return withConversationLock(id, async () => {
    const conversation = await getConversation(id);
    if (!conversation) return null;
    const result = await mutate(conversation);
    conversation.updatedAt = new Date().toISOString();
    await writeConversationFile(conversation);
    return result;
  });
}

/**
 * Append a message unless it is already stored (deduped by message id),
 * creating the conversation from `seed` when it does not exist yet. Created,
 * checked and written under one lock so a concurrent wave cannot drop it.
 */
export async function upsertMessage(seed: Conversation, message: unknown): Promise<void> {
  await withConversationLock(seed.id, async () => {
    const conversation = (await getConversation(seed.id)) ?? seed;
    const messageId = (message as { id?: string })?.id;
    const stored = conversation.messages.some(
      (existing) => (existing as { id?: string })?.id === messageId,
    );
    if (!stored) {
      conversation.messages.push(message);
    }
    conversation.updatedAt = new Date().toISOString();
    await writeConversationFile(conversation);
  });
}

export async function deleteConversation(id: string): Promise<boolean> {
  return withConversationLock(id, async () => {
    try {
      await fs.unlink(conversationPath(id));
      return true;
    } catch {
      return false;
    }
  });
}

