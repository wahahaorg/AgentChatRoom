import { NextResponse } from 'next/server';
import { readConfig, writeConfig } from '@/lib/storage/config-store';
import type { CouncilConfig } from '@/lib/types/config';

function maskKey(key?: string): string {
  if (!key) return '';
  return `${'•'.repeat(Math.max(0, key.length - 4))}${key.slice(-4)}`;
}

export async function GET() {
  try {
    const config = await readConfig();
    // Mask API keys for the frontend (show only last 4 chars)
    const masked = {
      ...config,
      apiKeys: Object.fromEntries(
        Object.entries(config.apiKeys).map(([provider, key]) => [
          provider,
          maskKey(key),
        ])
      ),
      customProviders: (config.customProviders ?? []).map((cp) => ({
        ...cp,
        apiKey: maskKey(cp.apiKey),
      })),
    };
    return NextResponse.json(masked);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to read config' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as Partial<CouncilConfig>;
    const current = await readConfig();

    const updated: CouncilConfig = {
      ...current,
      ...body,
      apiKeys: {
        ...current.apiKeys,
        ...(body.apiKeys ?? {}),
      },
      customProviders: body.customProviders !== undefined ? body.customProviders : (current.customProviders ?? []),
      orchestration: {
        ...current.orchestration,
        ...(body.orchestration ?? {}),
      },
    };

    // Don't overwrite real keys with masked values
    for (const [provider, key] of Object.entries(updated.apiKeys)) {
      if (key && key.includes('•')) {
        const currentKey = current.apiKeys[provider];
        if (currentKey) {
          updated.apiKeys[provider] = currentKey;
        }
      }
    }

    // Don't overwrite real keys in customProviders with masked values
    if (updated.customProviders) {
      updated.customProviders = updated.customProviders.map((cp) => {
        if (cp.apiKey && cp.apiKey.includes('•')) {
          const existing = current.customProviders?.find((c) => c.id === cp.id);
          return {
            ...cp,
            apiKey: existing?.apiKey ?? cp.apiKey,
          };
        }
        return cp;
      });
    }

    await writeConfig(updated);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update config' },
      { status: 500 }
    );
  }
}
