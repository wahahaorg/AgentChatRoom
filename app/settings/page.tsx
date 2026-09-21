'use client';

import { useState, useEffect, useCallback } from 'react';
import { ApiKeyManager } from '@/components/settings/api-key-manager';
import { CustomProviderManager } from '@/components/settings/custom-provider-manager';
import { AgentConfigurator } from '@/components/settings/agent-configurator';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n';
import type { ProviderId, CouncilConfig } from '@/lib/types/config';
import type { AgentConfig } from '@/lib/types/agents';
import Link from 'next/link';

export default function SettingsPage() {
  const { t } = useI18n();
  const [apiKeys, setApiKeys] = useState<Partial<Record<ProviderId, string>>>({});
  const [customProviders, setCustomProviders] = useState<CouncilConfig['customProviders']>([]);
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/config');
      const data = (await res.json()) as CouncilConfig;
      setApiKeys(data.apiKeys ?? {});
      setCustomProviders(data.customProviders ?? []);
      setAgents(data.agents ?? []);
    } catch {
      toast.error(t.loadFailed);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleSave = async (providerId: ProviderId, apiKey: string) => {
    try {
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKeys: { [providerId]: apiKey } }),
      });
      if (!res.ok) throw new Error('Failed to save');
      toast.success(t.keySaved(providerId));
      await fetchConfig();
    } catch {
      toast.error(t.saveFailed);
    }
  };

  const handleRemove = async (providerId: ProviderId) => {
    try {
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKeys: { [providerId]: '' } }),
      });
      if (!res.ok) throw new Error('Failed to remove');
      toast.success(t.keyRemoved);
      await fetchConfig();
    } catch {
      toast.error(t.removeFailed);
    }
  };

  const handleTest = async (providerId: ProviderId, apiKey: string) => {
    const res = await fetch('/api/config/test-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId, apiKey }),
    });
    return res.json();
  };

  const handleSaveProvider = async (provider: CouncilConfig['customProviders'][number]) => {
    try {
      const config = await (await fetch('/api/config')).json();
      const existing = (config.customProviders ?? []).filter(
        (cp: CouncilConfig['customProviders'][number]) => cp.id !== provider.id
      );
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customProviders: [...existing, provider] }),
      });
      if (!res.ok) throw new Error('Failed to save');
      toast.success(t.customSaved(provider.name));
      await fetchConfig();
    } catch {
      toast.error(t.customSaveFailed);
    }
  };

  const handleRemoveProvider = async (providerId: string) => {
    try {
      const config = await (await fetch('/api/config')).json();
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customProviders: (config.customProviders ?? []).filter(
            (cp: CouncilConfig['customProviders'][number]) => cp.id !== providerId
          ),
        }),
      });
      if (!res.ok) throw new Error('Failed to remove');
      toast.success(t.customRemoved);
      await fetchConfig();
    } catch {
      toast.error(t.customRemoveFailed);
    }
  };

  const handleTestProvider = async (
    providerId: string,
    apiKey: string,
    baseURL: string
  ) => {
    const res = await fetch('/api/config/test-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId, apiKey, baseURL, isCustom: true }),
    });
    return res.json();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">{t.loading}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">{t.settingsTitle}</h1>
            <p className="text-muted-foreground mt-1">
              {t.settingsSubtitle}
            </p>
          </div>
          <Link href="/chat">
            <Button variant="outline">{t.backToChat}</Button>
          </Link>
        </div>

        <div className="space-y-8">
          <section>
            <h2 className="text-lg font-semibold mb-4">{t.apiKeys}</h2>
            <p className="text-sm text-muted-foreground mb-4">
              {t.apiKeysNote}
            </p>
            <ApiKeyManager
              apiKeys={apiKeys}
              onSave={handleSave}
              onRemove={handleRemove}
              onTest={handleTest}
            />
          </section>

          <Separator />

          <section>
            <CustomProviderManager
              customProviders={customProviders}
              onSaveProvider={handleSaveProvider}
              onRemoveProvider={handleRemoveProvider}
              onTestProvider={handleTestProvider}
            />
          </section>

          <Separator />

          <section>
            <AgentConfigurator
              agents={agents}
              apiKeys={apiKeys}
              customProviders={customProviders}
              onAdd={async (agent) => {
                try {
                  const config = await (await fetch('/api/config')).json();
                  const res = await fetch('/api/config', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      agents: [...(config.agents ?? []), agent],
                      defaultPrimaryAgentId: config.defaultPrimaryAgentId ?? agent.id,
                    }),
                  });
                  if (!res.ok) throw new Error('Failed to add agent');
                  toast.success(t.agentAdded(agent.name));
                  await fetchConfig();
                } catch {
                  toast.error(t.addAgentFailed);
                }
              }}
              onRemove={async (agentId) => {
                try {
                  const config = await (await fetch('/api/config')).json();
                  const res = await fetch('/api/config', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      agents: (config.agents ?? []).filter((a: AgentConfig) => a.id !== agentId),
                      defaultPrimaryAgentId:
                        config.defaultPrimaryAgentId === agentId
                          ? null
                          : config.defaultPrimaryAgentId,
                    }),
                  });
                  if (!res.ok) throw new Error('Failed to remove agent');
                  toast.success(t.agentRemoved);
                  await fetchConfig();
                } catch {
                  toast.error(t.removeAgentFailed);
                }
              }}
              onUpdate={async (agent) => {
                try {
                  const config = await (await fetch('/api/config')).json();
                  const res = await fetch('/api/config', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      agents: (config.agents ?? []).map((a: AgentConfig) =>
                        a.id === agent.id ? agent : a
                      ),
                    }),
                  });
                  if (!res.ok) throw new Error('Failed to update agent');
                  toast.success(t.agentAdded(agent.name));
                  await fetchConfig();
                } catch {
                  toast.error(t.addAgentFailed);
                }
              }}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
