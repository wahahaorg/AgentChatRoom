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
}

export interface CouncilConfig {
  apiKeys: Partial<Record<string, string>>;
  customProviders: CustomProviderConfig[];
  agents: import('./agents').AgentConfig[];
  defaultMode: import('./council').ConversationMode;
  defaultPrimaryAgentId: string | null;
  orchestration: OrchestrationConfig;
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
};

export const DEFAULT_CONFIG: CouncilConfig = {
  apiKeys: {},
  customProviders: [],
  agents: [],
  defaultMode: 'council',
  defaultPrimaryAgentId: null,
  orchestration: DEFAULT_ORCHESTRATION_CONFIG,
};

