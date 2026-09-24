import { describe, it, expect, beforeAll } from 'vitest';
import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';

/**
 * Regression tests for conversation persistence.
 *
 * The bug these lock down: every conversation mutation used to read the whole
 * file, change it in memory and write it back, while only the *writes* were
 * serialized. A live-persistence flush (appending agent messages) and a
 * live-status update running at the same time therefore clobbered each other —
 * whichever wrote last wrote its stale snapshot, and the agent's interjections
 * disappeared from the stored conversation.
 */

let store: typeof import('@/lib/storage/conversation-store');
let live: typeof import('@/lib/orchestrator/live-persistence');

const SESSION = { mode: 'free-chat' as const, primaryAgentId: '', agentIds: [] };

beforeAll(async () => {
  // Isolate from the repo's real .council directory: the modules resolve their
  // storage path from process.cwd() at import time.
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'council-store-'));
  process.chdir(dir);
  store = await import('@/lib/storage/conversation-store');
  live = await import('@/lib/orchestrator/live-persistence');
});

async function seed(id: string, messages: unknown[] = []): Promise<void> {
  const now = new Date().toISOString();
  await store.saveConversation({
    id,
    title: 'test',
    mode: 'free-chat',
    primaryAgentId: '',
    agentIds: [],
    messages,
    createdAt: now,
    updatedAt: now,
  });
}

function textMessage(id: string) {
  return { id, role: 'user', parts: [{ type: 'text', text: id }] };
}

describe('conversation store', () => {
  it('does not lose concurrent read-modify-write updates', async () => {
    const id = 'concurrent-updates';
    await seed(id);

    await Promise.all(
      Array.from({ length: 25 }, (_, index) =>
        store.updateConversation(id, (conversation) => {
          conversation.messages.push(textMessage(`m${index}`));
        }),
      ),
    );

    const conversation = await store.getConversation(id);
    const ids = (conversation!.messages as { id: string }[]).map((message) => message.id);
    expect(ids).toHaveLength(25);
    expect(new Set(ids).size).toBe(25);
  });

  it('creates from the seed and dedupes by message id', async () => {
    const now = new Date().toISOString();
    const seedConversation = {
      id: 'upserted',
      title: 'seeded',
      mode: 'council' as const,
      primaryAgentId: 'a1',
      agentIds: ['a1'],
      messages: [],
      createdAt: now,
      updatedAt: now,
    };

    await store.upsertMessage(seedConversation, textMessage('user-1'));
    await store.upsertMessage(seedConversation, textMessage('user-1'));
    await store.upsertMessage(seedConversation, textMessage('user-2'));

    const conversation = await store.getConversation('upserted');
    expect(conversation!.title).toBe('seeded');
    expect(conversation!.mode).toBe('council');
    expect((conversation!.messages as { id: string }[]).map((m) => m.id)).toEqual(['user-1', 'user-2']);
  });

  it('reports a missing conversation when deleting', async () => {
    expect(await store.deleteConversation('does-not-exist')).toBe(false);
  });

  it('round-trips a title update', async () => {
    await seed('titled');
    expect(await store.updateConversationTitle('titled', 'renamed')).toBe(true);
    expect((await store.getConversation('titled'))!.title).toBe('renamed');
    expect(await store.updateConversationTitle('missing', 'x')).toBe(false);
  });
});

describe('live wave persistence', () => {
  it('stores the wave under the id the stream announced, with metadata', async () => {
    const id = 'wave-id';
    await seed(id);

    const metadata = { primaryAgent: { id: 'a1', name: 'Analyst' }, mode: 'council' };
    await live.startLiveWave(id, SESSION, { messageId: 'assistant-1', metadata });
    live.appendLivePart(id, { type: 'data-interjection', data: { content: 'hello' } });
    await live.finishLiveWave(id);

    const conversation = await store.getConversation(id);
    const messages = conversation!.messages as { id: string; role: string; metadata?: unknown; parts?: unknown[] }[];
    expect(messages).toHaveLength(1);
    expect(messages[0].id).toBe('assistant-1');
    expect(messages[0].role).toBe('assistant');
    expect(messages[0].metadata).toEqual(metadata);
    expect(messages[0].parts).toHaveLength(1);
  });

  it('keeps every part when status updates interleave with flushes', async () => {
    const id = 'wave-vs-status';
    await seed(id);
    await live.startLiveWave(id, SESSION, { messageId: 'assistant-2' });

    const expected: string[] = [];
    for (let index = 0; index < 12; index++) {
      // What runFreeChatMode emits per agent turn: an interjection, a reaction
      // part, and a "who is speaking" status write — all on the same file.
      live.appendLivePart(id, { type: 'data-interjection', data: { content: `i${index}` } });
      expected.push(`i${index}`);
      void live.setLiveStatus(id, `agent ${index} is deciding whether to speak`);
      live.appendLivePart(id, { type: 'data-reaction', data: { emoji: `r${index}` } });
      expected.push(`r${index}`);
    }
    await live.finishLiveWave(id);

    const conversation = await store.getConversation(id);
    const wave = (conversation!.messages as { id: string; parts?: { data?: { content?: string; emoji?: string } }[] }[])
      .find((message) => message.id === 'assistant-2')!;
    const stored = (wave.parts ?? []).map((part) => part.data?.content ?? part.data?.emoji);

    expect(stored).toHaveLength(expected.length);
    for (const value of expected) {
      expect(stored).toContain(value);
    }
    // Parts are append-only: a concurrent flush must never re-append them.
    expect(new Set(stored).size).toBe(stored.length);
  });

  it('appends to the same message across successive flushes', async () => {
    const id = 'wave-multi-flush';
    await seed(id);
    await live.startLiveWave(id, SESSION, { messageId: 'assistant-3' });

    live.appendLivePart(id, { type: 'data-interjection', data: { content: 'first' } });
    await live.flushLiveWave(id);

    live.appendLivePart(id, { type: 'data-interjection', data: { content: 'second' } });
    await live.finishLiveWave(id);

    const conversation = await store.getConversation(id);
    const messages = conversation!.messages as { id: string; parts?: unknown[] }[];
    const wave = messages.filter((message) => message.id === 'assistant-3');
    expect(wave).toHaveLength(1);
    expect(wave[0].parts).toHaveLength(2);
  });

  it('does not write an empty message when nothing was emitted', async () => {
    const id = 'wave-empty';
    await seed(id);
    await live.startLiveWave(id, SESSION, { messageId: 'assistant-4' });
    await live.finishLiveWave(id);

    const conversation = await store.getConversation(id);
    expect(conversation!.messages).toHaveLength(0);
  });

  it('ignores appends after the wave ends', async () => {
    const id = 'wave-ended';
    await seed(id);
    await live.startLiveWave(id, SESSION, { messageId: 'assistant-5' });
    live.appendLivePart(id, { type: 'data-interjection', data: { content: 'kept' } });
    await live.finishLiveWave(id);

    live.appendLivePart(id, { type: 'data-interjection', data: { content: 'dropped' } });
    await live.flushLiveWave(id);

    const conversation = await store.getConversation(id);
    const wave = (conversation!.messages as { id: string; parts?: { data?: { content?: string } }[] }[])
      .find((message) => message.id === 'assistant-5')!;
    expect(wave.parts).toHaveLength(1);
    expect(wave.parts![0].data!.content).toBe('kept');
  });

  it('flushes the previous wave before a second one replaces it', async () => {
    const id = 'wave-overlap';
    await seed(id);

    // Two viewers send at (almost) the same moment: the second wave must not
    // drop the first one's buffered-but-unflushed parts.
    await live.startLiveWave(id, SESSION, { messageId: 'assistant-a' });
    live.appendLivePart(id, { type: 'data-interjection', data: { content: 'from-a' } });

    await live.startLiveWave(id, SESSION, { messageId: 'assistant-b' });
    live.appendLivePart(id, { type: 'data-interjection', data: { content: 'from-b' } });
    await live.finishLiveWave(id);

    const conversation = await store.getConversation(id);
    const messages = conversation!.messages as { id: string; parts?: { data?: { content?: string } }[] }[];
    const a = messages.find((message) => message.id === 'assistant-a');
    const b = messages.find((message) => message.id === 'assistant-b');

    expect(a?.parts?.[0].data?.content).toBe('from-a');
    expect(b?.parts?.[0].data?.content).toBe('from-b');
  });
});
