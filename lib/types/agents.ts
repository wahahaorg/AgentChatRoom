import type { ProviderId } from './config';

export interface ThinkingConfig {
  type: 'adaptive' | 'effort' | 'level' | 'budget';
  value: string | number;
}

export interface AgentConfig {
  id: string;
  name: string;
  role: string;
  systemPrompt: string;
  providerId: ProviderId;
  modelId: string;
  colour: string;
  avatar: string;
  /** Optional scene tag — agents with the same scene are grouped together in UI. */
  scene?: string;
  thinking?: ThinkingConfig;
}

export interface AgentPreset {
  name: string;
  role: string;
  systemPrompt: string;
  category: 'general' | 'ml';
  avatar: string;
}

export type ModelTier = 'flagship' | 'efficient' | 'budget' | 'reasoning' | 'legacy';

export interface ReasoningCapability {
  type: 'effort';
  values: string[];
  default: string;
}

export interface ThinkingLevelCapability {
  type: 'level';
  values: string[];
  default: string;
}

export interface ThinkingBudgetCapability {
  type: 'budget';
  min: number;
  max: number;
  default: number;
}

export interface AdaptiveThinkingCapability {
  type: 'adaptive';
  values: string[];
  default: string;
}

export type ThinkingCapability =
  | ReasoningCapability
  | ThinkingLevelCapability
  | ThinkingBudgetCapability
  | AdaptiveThinkingCapability;

export interface ModelDefinition {
  id: string;
  name: string;
  tier: ModelTier;
  context?: string;
  capabilities: string[];
  reasoning?: ReasoningCapability;
  thinking?: ThinkingLevelCapability | ThinkingBudgetCapability | AdaptiveThinkingCapability;
}

export interface ProviderDefinition {
  name: string;
  models: ModelDefinition[] | 'dynamic';
  envVar?: string;
}
