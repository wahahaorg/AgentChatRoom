'use client';

import { useState, useEffect, useCallback } from 'react';
import { UnifiedProviderManager } from '@/components/settings/unified-provider-manager';
import { AgentConfigurator } from '@/components/settings/agent-configurator';
import { SceneManager } from '@/components/settings/scene-manager';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n';
import type { ProviderId, CouncilConfig } from '@/lib/types/config';
import type { AgentConfig } from '@/lib/types/agents';
import Link from 'next/link';
import { Server, Bot, Sparkles, ArrowLeft } from 'lucide-react';

export default function SettingsPage() {
  const { t } = useI18n();
  const [apiKeys, setApiKeys] = useState<Partial<Record<ProviderId, string>>>({});
  const [customProviders, setCustomProviders] = useState<CouncilConfig['customProviders']>([]);
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [scenes, setScenes] = useState<CouncilConfig['scenes']>([]);
  const [loading, setLoading] = useState(true);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/config');
      const data = (await res.json()) as CouncilConfig;
      setApiKeys(data.apiKeys ?? {});
      setCustomProviders(data.customProviders ?? []);
      setAgents(data.agents ?? []);
      setScenes(data.scenes ?? []);
    } catch {
      toast.error(t.loadFailed);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleSaveApiKey = async (providerId: ProviderId, apiKey: string) => {
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

  const handleRemoveApiKey = async (providerId: ProviderId) => {
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

  const handleTestApiKey = async (providerId: ProviderId, apiKey: string) => {
    const res = await fetch('/api/config/test-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId, apiKey }),
    });
    return res.json();
  };

  const handleSaveCustomProvider = async (provider: CouncilConfig['customProviders'][number]) => {
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

  const handleRemoveCustomProvider = async (providerId: string) => {
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

  const handleTestCustomProvider = async (
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
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        {/* Top Header */}
        <div className="flex items-center justify-between pb-6 border-b mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">系统设置</h1>
            <p className="text-xs text-muted-foreground mt-1">
              管理大模型服务商 API 密钥、配置智能体成员与定制研讨场景。
            </p>
          </div>
          <Link href="/chat">
            <Button variant="outline" size="sm" className="gap-1.5 cursor-pointer">
              <ArrowLeft className="h-4 w-4" />
              <span>{t.backToChat}</span>
            </Button>
          </Link>
        </div>

        {/* Tabbed Layout: Zero infinite scrolling */}
        <Tabs defaultValue="providers" className="w-full">
          <TabsList className="grid grid-cols-3 w-full max-w-md mb-6 h-9 p-1 bg-muted/80">
            <TabsTrigger value="providers" className="gap-1.5 text-xs font-medium cursor-pointer">
              <Server className="h-3.5 w-3.5" />
              <span>模型服务商</span>
            </TabsTrigger>
            <TabsTrigger value="agents" className="gap-1.5 text-xs font-medium cursor-pointer">
              <Bot className="h-3.5 w-3.5" />
              <span>智能体成员</span>
            </TabsTrigger>
            <TabsTrigger value="scenes" className="gap-1.5 text-xs font-medium cursor-pointer">
              <Sparkles className="h-3.5 w-3.5" />
              <span>讨论场景</span>
            </TabsTrigger>
          </TabsList>

          {/* Tab 1: Providers & Keys */}
          <TabsContent value="providers" className="outline-hidden">
            <UnifiedProviderManager
              apiKeys={apiKeys}
              customProviders={customProviders ?? []}
              onSaveApiKey={handleSaveApiKey}
              onRemoveApiKey={handleRemoveApiKey}
              onTestApiKey={handleTestApiKey}
              onSaveCustomProvider={handleSaveCustomProvider}
              onRemoveCustomProvider={handleRemoveCustomProvider}
              onTestCustomProvider={handleTestCustomProvider}
            />
          </TabsContent>

          {/* Tab 2: Agents */}
          <TabsContent value="agents" className="outline-hidden">
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
          </TabsContent>

          {/* Tab 3: Scenes */}
          <TabsContent value="scenes" className="outline-hidden">
            <SceneManager
              scenes={scenes ?? []}
              agents={agents}
              onSave={async (nextScenes) => {
                try {
                  const res = await fetch('/api/config', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ scenes: nextScenes }),
                  });
                  if (!res.ok) throw new Error('Failed to save scenes');
                  toast.success('场景已保存');
                  await fetchConfig();
                } catch {
                  toast.error('保存场景失败');
                }
              }}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
