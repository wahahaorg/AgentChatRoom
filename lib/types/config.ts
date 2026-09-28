export type ProviderId = 'openai' | 'anthropic' | 'google' | 'openrouter' | (string & {});

export interface CustomProviderConfig {
  id: string;
  name: string;
  baseURL: string;
  apiKey?: string;
  models: string[];
}

export interface OrchestrationConfig {
  maxInterjectionDepth: number;
  cooldownMessages: number;
  maxInterjectionsPerMessage: number;
  requestRetryAttempts: number;
  requestBackoffInitialMs: number;
  requestBackoffMaxMs: number;
  requestBackoffJitterRatio: number;
  requestSpacingMs: number;
  /** Free-chat: hard cap on discussion rounds per user message. */
  freeChatMaxRounds: number;
  /** Free-chat: stop the wave once the accumulated discussion exceeds this many tokens. */
  freeChatTokenBudget: number;
}

export interface StickerSearchConfig {
  provider: string;
  token: string;
}

export interface CouncilConfig {
  apiKeys: Partial<Record<string, string>>;
  customProviders: CustomProviderConfig[];
  agents: import('./agents').AgentConfig[];
  scenes: import('./scene').Scene[];
  defaultMode: import('./council').ConversationMode;
  defaultPrimaryAgentId: string | null;
  orchestration: OrchestrationConfig;
  stickerSearch?: StickerSearchConfig;
}

export const DEFAULT_ORCHESTRATION_CONFIG: OrchestrationConfig = {
  maxInterjectionDepth: 1,
  cooldownMessages: 3,
  maxInterjectionsPerMessage: 2,
  requestRetryAttempts: 3,
  requestBackoffInitialMs: 1200,
  requestBackoffMaxMs: 30000,
  requestBackoffJitterRatio: 0.2,
  requestSpacingMs: 600,
  // A free-chat wave costs one model call per member per round, so the cap is
  // what keeps a single user message from burning dozens of calls. Both values
  // are overridable in .council/config.json -> orchestration.
  freeChatMaxRounds: 12,
  freeChatTokenBudget: 6000,
};

export const DEFAULT_CONFIG: CouncilConfig = {
  apiKeys: {},
  customProviders: [],
  agents: [],
  scenes: [],
  defaultMode: 'council',
  defaultPrimaryAgentId: null,
  orchestration: DEFAULT_ORCHESTRATION_CONFIG,
};

