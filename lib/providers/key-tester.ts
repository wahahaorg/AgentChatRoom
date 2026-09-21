import type { ProviderId } from '@/lib/types/config';

export async function testApiKey(
  providerId: ProviderId,
  apiKey: string,
  baseURL?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (baseURL || !['openai', 'anthropic', 'google', 'openrouter'].includes(providerId)) {
      if (!baseURL) {
        return { success: false, error: 'Base URL is required for custom API provider' };
      }
      const cleanBaseUrl = baseURL.replace(/\/+$/, '');
      const headers: Record<string, string> = {};
      if (apiKey?.trim()) {
        headers['Authorization'] = `Bearer ${apiKey.trim()}`;
      }

      // 1. Try GET /models first
      try {
        const res = await fetch(`${cleanBaseUrl}/models`, {
          method: 'GET',
          headers,
        });
        if (res.ok) {
          return { success: true };
        }
        if (res.status === 401 || res.status === 403) {
          return { success: false, error: `Invalid API key (HTTP ${res.status})` };
        }
      } catch {
        // Fall back to /chat/completions check below
      }

      // 2. Try POST /chat/completions test
      try {
        const res = await fetch(`${cleanBaseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            ...headers,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'test',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'hi' }],
          }),
        });

        if (res.status === 401 || res.status === 403) {
          return { success: false, error: `Invalid API key (HTTP ${res.status})` };
        }
        if (res.status === 404) {
          return {
            success: false,
            error: 'Endpoint not found (404). Please verify your Base URL (e.g. check if /v1 is required).',
          };
        }
        // If 200 or 400 (e.g. model not found), server is responding and authenticated
        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: `Could not connect to ${cleanBaseUrl}: ${err instanceof Error ? err.message : 'Connection failed'}`,
        };
      }
    }

    switch (providerId) {
      case 'openai': {
        const response = await fetch('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!response.ok) {
          return { success: false, error: `OpenAI API returned ${response.status}` };
        }
        return { success: true };
      }
      case 'anthropic': {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'hi' }],
          }),
        });
        // 200 or 400 (bad request but authenticated) both mean key works
        if (response.status === 401 || response.status === 403) {
          return { success: false, error: 'Invalid API key' };
        }
        return { success: true };
      }
      case 'google': {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
        );
        if (!response.ok) {
          return { success: false, error: `Google API returned ${response.status}` };
        }
        return { success: true };
      }
      case 'openrouter': {
        const response = await fetch('https://openrouter.ai/api/v1/models', {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!response.ok) {
          return { success: false, error: `OpenRouter API returned ${response.status}` };
        }
        return { success: true };
      }
      default:
        return { success: false, error: `Unknown provider: ${providerId}` };
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
