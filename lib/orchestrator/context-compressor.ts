import { generateText, type ModelMessage } from 'ai';
import type { AgentConfig } from '@/lib/types/agents';
import type { CouncilConfig } from '@/lib/types/config';
import { createModelInstance } from '@/lib/providers/provider-factory';

/** Rough token estimate: ~4 chars per token for mixed CJK/English text. */
function estimateTokens(messages: ModelMessage[]): number {
  let chars = 0;
  for (const message of messages) {
    if (typeof message.content === 'string') {
      chars += message.content.length;
    } else if (Array.isArray(message.content)) {
      for (const part of message.content) {
        if ('text' in part && typeof part.text === 'string') {
          chars += part.text.length;
        }
      }
    }
  }
  return Math.ceil(chars / 4);
}

const SUMMARIZATION_PROMPT = `Summarize the following conversation history into a concise "context so far" briefing. Keep:
- The user's original questions and goals
- Key conclusions and points made by each participant
- Any unresolved questions or open items
Be concise (under 400 words). Write the summary in the same language as the conversation.`;

/**
 * Compress long conversation histories before sending to models.
 * Keeps the most recent messages intact and summarizes older ones into a
 * single briefing message, so token usage stays bounded in long group chats.
 */
export async function compressContextIfNeeded(
  modelMessages: ModelMessage[],
  primaryAgent: AgentConfig,
  config: CouncilConfig,
  options?: {
    /** Approximate token count above which compression kicks in. */
    maxTokens?: number;
    /** Number of recent messages to always keep verbatim. */
    keepRecent?: number;
  },
): Promise<{ messages: ModelMessage[]; compressed: boolean }> {
  const maxTokens = options?.maxTokens ?? 12000;
  const keepRecent = options?.keepRecent ?? 8;

  if (estimateTokens(modelMessages) <= maxTokens) {
    return { messages: modelMessages, compressed: false };
  }

  const cutoff = Math.max(0, modelMessages.length - keepRecent);
  if (cutoff === 0) {
    return { messages: modelMessages, compressed: false };
  }

  const olderMessages = modelMessages.slice(0, cutoff);
  const recentMessages = modelMessages.slice(cutoff);

  // Build a readable transcript of the older messages for summarization
  const transcript = olderMessages
    .map((message) => {
      const role = message.role === 'user' ? 'User' : 'Agent';
      const content =
        typeof message.content === 'string'
          ? message.content
          : Array.isArray(message.content)
            ? message.content
                .filter((part): part is { type: 'text'; text: string } => 'text' in part)
                .map((part) => part.text)
                .join('\n')
            : '';
      return `${role}: ${content}`;
    })
    .join('\n\n');

  try {
    const model = createModelInstance(primaryAgent, config);
    const result = await generateText({
      model,
      system: SUMMARIZATION_PROMPT,
      messages: [{ role: 'user', content: transcript }],
    });

    const summary = result.text.trim();
    if (!summary) {
      return { messages: modelMessages, compressed: false };
    }

    const compressedMessages: ModelMessage[] = [
      {
        role: 'user',
        content: `[Context summary of earlier conversation]\n${summary}`,
      },
      {
        role: 'assistant',
        content: '[Understood, I have the earlier context in mind.]',
      },
      ...recentMessages,
    ];

    return { messages: compressedMessages, compressed: true };
  } catch {
    // Summarization failed — fall back to the full history rather than dropping context
    return { messages: modelMessages, compressed: false };
  }
}
