import { promises as fs } from 'fs';
import path from 'path';
import type { CouncilConfig } from '@/lib/types/config';
import { DEFAULT_CONFIG } from '@/lib/types/config';

const CONFIG_DIR = path.join(process.cwd(), '.council');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

async function ensureConfigDir() {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
  } catch {
    // Directory already exists
  }
}

export async function readConfig(): Promise<CouncilConfig> {
  try {
    await ensureConfigDir();
    const data = await fs.readFile(CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(data) as Partial<CouncilConfig>;
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      apiKeys: {
        ...DEFAULT_CONFIG.apiKeys,
        ...(parsed.apiKeys ?? {}),
      },
      customProviders: parsed.customProviders ?? DEFAULT_CONFIG.customProviders ?? [],
      agents: parsed.agents ?? DEFAULT_CONFIG.agents,
      orchestration: {
        ...DEFAULT_CONFIG.orchestration,
        ...(parsed.orchestration ?? {}),
      },
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function writeConfig(config: CouncilConfig): Promise<void> {
  await ensureConfigDir();
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

export async function updateConfig(
  updater: (config: CouncilConfig) => CouncilConfig
): Promise<CouncilConfig> {
  const config = await readConfig();
  const updated = updater(config);
  await writeConfig(updated);
  return updated;
}
