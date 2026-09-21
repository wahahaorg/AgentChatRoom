export type ConversationMode = 'council' | 'round-robin';

export interface GateDecision {
  agentId: string;
  agentName: string;
  decision: 'yes' | 'no';
  reason: string;
}

export interface InterjectionCooldown {
  agentId: string;
  lastInterjectionAt: number;
}

export interface CouncilSession {
  id: string;
  title: string;
  mode: ConversationMode;
  primaryAgentId: string;
  silentAgentIds: string[];
  cooldowns: InterjectionCooldown[];
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SessionConfig {
  mode: ConversationMode;
  primaryAgentId: string;
  agentIds: string[];
  conversationId?: string;
}

/** Agent IDs @-mentioned in the latest user message. */
export interface MentionData {
  mentionedAgentIds: string[];
}

export interface AgentStatus {
  agentId: string;
  agentName: string;
  phase: 'idle' | 'thinking' | 'gate-checking' | 'interjecting' | 'responding';
}

export interface InterjectionData {
  agentId: string;
  agentName: string;
  agentRole: string;
  agentColour: string;
  content: string;
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
