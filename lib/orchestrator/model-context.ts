import { convertToModelMessages, type ModelMessage, type UIMessage } from 'ai';

/**
 * Turn stored UI messages into model messages.
 *
 * The AI SDK's `convertToModelMessages` only understands `text` and `file`
 * parts. A group-chat wave is stored almost entirely as data parts
 * (`data-interjection`, `data-reaction`, ...), which the SDK converts to
 * `undefined` and then drops the whole assistant message for having no
 * content — so the model saw a transcript of bare user messages and had no
 * idea what anybody said in earlier rounds.
 *
 * This module maps those parts back into attributed text lines ("亚航老油条（群友）: ..."),
 * which is also the format the in-wave transcript uses, so a model reads the
 * same shape whether a line arrived live or was loaded from disk.
 */

interface StoredAgentStamp {
  agentName?: string;
  agentRole?: string;
}

function readStamp(data: unknown): StoredAgentStamp {
  if (!data || typeof data !== 'object') return {};
  const record = data as Record<string, unknown>;
  return {
    agentName: typeof record.agentName === 'string' ? record.agentName : undefined,
    agentRole: typeof record.agentRole === 'string' ? record.agentRole : undefined,
  };
}

function label(name: string | undefined, role: string | undefined, fallback: string): string {
  if (!name) return fallback;
  return role ? `${name}（${role}）` : name;
}

/** Who wrote an assistant message — recorded in its metadata by the orchestrator. */
function authorOf(message: UIMessage): string | undefined {
  const metadata = message.metadata as
    | { primaryAgent?: { name?: string; role?: string } }
    | undefined;
  const agent = metadata?.primaryAgent;
  if (!agent?.name) return undefined;
  return label(agent.name, agent.role, agent.name);
}

/**
 * Give each stored assistant reply a speaker prefix. Without it a group
 * transcript reads like one person talking to themselves, and the model
 * cannot tell whose argument it is replying to.
 */
function labelAssistantText(message: UIMessage): UIMessage {
  if (message.role !== 'assistant') return message;
  const author = authorOf(message);
  if (!author) return message;

  let changed = false;
  const parts = (message.parts ?? []).map((part) => {
    if (part.type !== 'text' || !part.text.trim()) return part;
    changed = true;
    return { ...part, text: `${author}：${part.text}` };
  });

  return changed ? { ...message, parts } : message;
}

type TextModelPart = { type: 'text'; text: string };

/**
 * Convert one stored data part into a text line for the model, or `undefined`
 * for parts that carry nothing a model can use (stickers, error notices).
 */
function dataPartToText(part: { type: string; data?: unknown }): TextModelPart | undefined {
  if (part.type === 'data-interjection') {
    const data = part.data as { content?: unknown } | undefined;
    const content = typeof data?.content === 'string' ? data.content.trim() : '';
    if (!content) return undefined;
    const { agentName, agentRole } = readStamp(part.data);
    return { type: 'text', text: `${label(agentName, agentRole, '群成员')}：${content}` };
  }

  if (part.type === 'data-reaction') {
    const data = part.data as { emoji?: unknown; target?: unknown } | undefined;
    const emoji = typeof data?.emoji === 'string' ? data.emoji : '';
    if (!emoji) return undefined;
    const { agentName, agentRole } = readStamp(part.data);
    const target = typeof data?.target === 'string' ? data.target.trim() : '';
    const about = target ? `「${target}」` : '上面某条消息';
    return {
      type: 'text',
      text: `（${label(agentName, agentRole, '群成员')} 对 ${about} 回应了 ${emoji}）`,
    };
  }

  return undefined;
}

/**
 * An assistant message is worth sending when it has something a model can
 * read: real text, or a data part this module knows how to convert.
 */
function hasModelUsableContent(message: UIMessage): boolean {
  return (message.parts ?? []).some((part) => {
    if (part.type === 'text') return part.text.trim().length > 0;
    if (part.type === 'reasoning' || part.type === 'step-start') return false;
    if (part.type.startsWith('data-')) return dataPartToText(part) !== undefined;
    return true;
  });
}

/** Drop assistant messages a model cannot read anything from. */
export function sanitizeIncomingMessages(messages: UIMessage[]): UIMessage[] {
  return messages.filter(
    (message) => message.role !== 'assistant' || hasModelUsableContent(message),
  );
}

export function buildModelMessages(messages: UIMessage[]): Promise<ModelMessage[]> {
  const usable = sanitizeIncomingMessages(messages).map((message) =>
    labelAssistantText(message),
  );

  return convertToModelMessages(usable, {
    convertDataPart: dataPartToText as never,
  });
}
