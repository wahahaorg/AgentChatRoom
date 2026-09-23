import type { ConversationMode } from './council';

/**
 * A reusable scene: a named group of agents with a default discussion mode.
 * Scenes reference agents by id (many-to-many — an agent can belong to
 * multiple scenes and is shared, not copied).
 */
export interface Scene {
  id: string;
  name: string;
  emoji?: string;
  mode: ConversationMode;
  description?: string;
  agentIds: string[];
}
