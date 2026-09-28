export type ConversationMode = 'council' | 'round-robin' | 'free-chat';

export interface GateDecision {
  agentId: string;
  agentName: string;
  decision: 'yes' | 'no';
  reason: string;
}

export interface SessionConfig {
  mode: ConversationMode;
  primaryAgentId: string;
  agentIds: string[];
  conversationId?: string;
}

/** A persisted conversation with per-chat agent and mode configuration. */
export interface Conversation {
  id: string;
  title: string;
  mode: ConversationMode;
  primaryAgentId: string;
  agentIds: string[];
  /** Serialised UIMessage[] from the AI SDK */
  messages: unknown[];
  /** Live orchestration status shown to all viewers while a wave is running. */
  liveStatus?: { message: string; updatedAt: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  mode: ConversationMode;
  messageCount: number;
  updatedAt: string;
}
