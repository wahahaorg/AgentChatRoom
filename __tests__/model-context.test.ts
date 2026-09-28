import { describe, it, expect } from 'vitest';
import type { UIMessage } from 'ai';
import { buildModelMessages } from '@/lib/orchestrator/model-context';

/**
 * Regression tests for group-chat history reaching the model.
 *
 * A wave is stored as data parts. `convertToModelMessages` converts unknown
 * data parts to `undefined`, which left the assistant message with no content
 * at all, so the SDK dropped it: agents were answering without seeing a single
 * thing that had been said in earlier rounds.
 */

function message(
  role: 'user' | 'assistant',
  parts: unknown[],
  metadata?: unknown,
): UIMessage {
  return { id: `m-${role}-${parts.length}`, role, parts, ...(metadata ? { metadata } : {}) } as UIMessage;
}

function interjection(name: string, role: string, content: string) {
  return {
    type: 'data-interjection',
    data: { agentId: `a-${name}`, agentName: name, agentRole: role, content },
  };
}

/** Flatten model messages into readable lines so assertions stay readable. */
function lines(messages: Awaited<ReturnType<typeof buildModelMessages>>): string[] {
  return messages.map((modelMessage) => {
    const content = modelMessage.content;
    const text =
      typeof content === 'string'
        ? content
        : content
            .filter((part): part is { type: 'text'; text: string } => 'text' in part)
            .map((part) => part.text)
            .join('\n');
    return `${modelMessage.role}: ${text}`;
  });
}

describe('buildModelMessages', () => {
  it('keeps an interjection-only wave in the model context', async () => {
    const messages = [
      message('user', [{ type: 'text', text: '去哪儿玩' }]),
      message('assistant', [
        interjection('亚航老油条', '东南亚通', '普吉岛机票才800'),
        interjection('省钱精', '抠门型', '淡季再去'),
      ]),
    ];

    const result = lines(await buildModelMessages(messages));

    expect(result).toHaveLength(2);
    expect(result[1]).toContain('assistant');
    expect(result[1]).toContain('亚航老油条（东南亚通）：普吉岛机票才800');
    expect(result[1]).toContain('省钱精（抠门型）：淡季再去');
  });

  it('converts reactions into a compact note', async () => {
    const messages = [
      message('assistant', [
        {
          type: 'data-reaction',
          data: { agentName: '老王', agentRole: '群友', emoji: '👍', target: '普吉岛机票才800' },
        },
      ]),
    ];

    const result = lines(await buildModelMessages(messages));

    expect(result).toHaveLength(1);
    expect(result[0]).toContain('老王（群友）');
    expect(result[0]).toContain('👍');
    expect(result[0]).toContain('普吉岛机票才800');
  });

  it('labels stored assistant text with the agent that wrote it', async () => {
    const messages = [
      message(
        'assistant',
        [{ type: 'text', text: '我的结论是先去曼谷' }],
        { primaryAgent: { id: 'a1', name: '行程规划师', role: '领队' }, mode: 'council' },
      ),
    ];

    const result = lines(await buildModelMessages(messages));

    expect(result[0]).toBe('assistant: 行程规划师（领队）：我的结论是先去曼谷');
  });

  it('drops a wave that carries nothing a model can read', async () => {
    const messages = [
      message('assistant', [{ type: 'data-sticker', data: { agentName: '老王', emoji: '🤣' } }]),
    ];

    expect(await buildModelMessages(messages)).toEqual([]);
  });

  it('leaves user messages untouched', async () => {
    const messages = [message('user', [{ type: 'text', text: '去哪儿玩' }])];

    const result = lines(await buildModelMessages(messages));

    expect(result).toEqual(['user: 去哪儿玩']);
  });
});
