export interface ParsedInterjection {
  agentAvatar?: string;
  agentColour?: string;
  agentName: string;
  agentRole: string;
  content: string;
}

export interface ParsedResponse {
  primaryContent: string;
  interjections: ParsedInterjection[];
}

/**
 * Parse the streamed response text to extract the primary response
 * and any interjections embedded by the orchestrator.
 *
 * Interjections are formatted as:
 * ---
 *
 * **emoji Name** _(Role)_:
 *
 * content
 */
export function parseResponse(text: string): ParsedResponse {
  // Split on the interjection delimiter pattern
  const interjectionPattern = /\n\n---\n\n\*\*(.{1,4}) (.+?)\*\* _\((.+?)\)_:\n\n/g;

  const interjections: ParsedInterjection[] = [];
  let primaryContent = text;

  // Find the first interjection delimiter to split primary content
  const firstMatch = interjectionPattern.exec(text);
  if (!firstMatch) {
    return { primaryContent: text, interjections: [] };
  }

  primaryContent = text.slice(0, firstMatch.index);

  // Reset and find all interjections
  interjectionPattern.lastIndex = 0;
  let match: RegExpExecArray | null;
  const matches: { index: number; avatar: string; name: string; role: string; endOfHeader: number }[] = [];

  while ((match = interjectionPattern.exec(text)) !== null) {
    matches.push({
      index: match.index,
      avatar: match[1].trim(),
      name: match[2],
      role: match[3],
      endOfHeader: match.index + match[0].length,
    });
  }

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const nextStart = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const content = text.slice(m.endOfHeader, nextStart).trim();

    interjections.push({
      agentAvatar: m.avatar,
      agentName: m.name,
      agentRole: m.role,
      content,
    });
  }

  return { primaryContent: primaryContent.trim(), interjections };
}
