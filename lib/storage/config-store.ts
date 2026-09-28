import { promises as fs } from 'fs';
import path from 'path';
import type { CouncilConfig } from '@/lib/types/config';
import { DEFAULT_CONFIG } from '@/lib/types/config';

const CONFIG_DIR = path.join(process.cwd(), '.council');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

/**
 * config.json is a single shared resource, so every write runs through one
 * lock. Without it, two settings saves (or a save racing the sticker-token
 * update) each read the same snapshot and the later write drops the other's
 * change — the same lost-update pattern that was dropping agent messages from
 * conversation files.
 */
let configLock: Promise<void> = Promise.resolve();

function ignore(): void {}

function withConfigLock<T>(run: () => Promise<T>): Promise<T> {
  const task = configLock.then(run, run);
  configLock = task.then(ignore, ignore);
  return task;
}

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
      scenes: parsed.scenes ?? DEFAULT_CONFIG.scenes,
      orchestration: {
        ...DEFAULT_CONFIG.orchestration,
        ...(parsed.orchestration ?? {}),
      },
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

/** Write through a temp file + rename so a crash cannot leave a half file. */
async function writeConfigFile(config: CouncilConfig): Promise<void> {
  await ensureConfigDir();
  const tmpPath = `${CONFIG_PATH}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    await fs.writeFile(tmpPath, JSON.stringify(config, null, 2), 'utf-8');
    await fs.rename(tmpPath, CONFIG_PATH);
  } catch (error) {
    await fs.unlink(tmpPath).catch(() => {});
    throw error;
  }
}

export async function writeConfig(config: CouncilConfig): Promise<void> {
  await withConfigLock(() => writeConfigFile(config));
}

export async function updateConfig(
  updater: (config: CouncilConfig) => CouncilConfig | Promise<CouncilConfig>
): Promise<CouncilConfig> {
  // Read and write under the same lock, so the updater always mutates the
  // latest config instead of a stale snapshot.
  return withConfigLock(async () => {
    const config = await readConfig();
    const updated = await updater(config);
    await writeConfigFile(updated);
    return updated;
  });
}
