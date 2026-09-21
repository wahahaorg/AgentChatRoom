import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import type { AgentConfig } from '@/lib/types/agents';
import type { CouncilConfig } from '@/lib/types/config';

const GOOGLE_MODEL_ALIASES: Record<string, string> = {
  'gemini-3.1-flash-lite': 'gemini-3.1-flash-lite-preview',
  'gemini-3-flash': 'gemini-3-flash-preview',
};

function normalizeGoogleModelId(modelId: string): string {
  return GOOGLE_MODEL_ALIASES[modelId] ?? modelId;
}

export function createModelInstance(agent: AgentConfig, config: CouncilConfig) {
  // Check if it's a custom provider
  const customProvider = config.customProviders?.find((p) => p.id === agent.providerId);
  if (customProvider) {
    const key = customProvider.apiKey || config.apiKeys[customProvider.id] || 'no-key-required';
    const openai = createOpenAI({
      baseURL: customProvider.baseURL,
      apiKey: key,
    });
    return openai(agent.modelId);
  }

  const apiKey = config.apiKeys[agent.providerId];
  if (!apiKey) {
    throw new Error(`No API key configured for provider: ${agent.providerId}`);
  }

  switch (agent.providerId) {
    case 'openai': {
      const openai = createOpenAI({ apiKey });
      return openai(agent.modelId);
    }
    case 'anthropic': {
      const anthropic = createAnthropic({ apiKey });
      return anthropic(agent.modelId);
    }
    case 'google': {
      const google = createGoogleGenerativeAI({ apiKey });
      return google(normalizeGoogleModelId(agent.modelId));
    }
    case 'openrouter': {
      const openrouter = createOpenRouter({ apiKey });
      return openrouter(agent.modelId);
    }
    default:
      throw new Error(`Unknown provider: ${agent.providerId}`);
  }
}

export function getThinkingParams(agent: AgentConfig): Record<string, Record<string, unknown>> {
  if (!agent.thinking) return {};

  switch (agent.thinking.type) {
    case 'adaptive':
      // Anthropic Opus 4.7 adaptive thinking uses the adaptive mode plus effort.
      return {
        anthropic: {
          thinking: { type: 'adaptive' },
          effort: agent.thinking.value as string,
        },
      };
    case 'effort':
      // OpenAI: reasoningEffort for o-series and GPT-5.x
      return {
        openai: { reasoningEffort: agent.thinking.value as string },
      };
    case 'level':
      // Google Gemini 3.x: thinkingLevel
      return {
        google: {
          thinkingConfig: { thinkingLevel: agent.thinking.value as string },
        },
      };
    case 'budget':
      // Google Gemini 2.5: thinkingBudget
      return {
        google: {
          thinkingConfig: { thinkingBudget: agent.thinking.value as number },
        },
      };
    default:
      return {};
  }
}
