'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { PROVIDERS, getModels, getModel } from '@/lib/providers/provider-registry';
import { AGENT_PRESETS } from '@/lib/agents/presets';
import { useI18n } from '@/lib/i18n';
import { nanoid } from 'nanoid';
import type { AgentConfig, ThinkingConfig } from '@/lib/types/agents';
import type { CustomProviderConfig, ProviderId } from '@/lib/types/config';

const AGENT_COLOURS = [
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1',
];

interface AgentConfiguratorProps {
  agents: AgentConfig[];
  apiKeys: Partial<Record<string, string>>;
  customProviders?: CustomProviderConfig[];
  onAdd: (agent: AgentConfig) => Promise<void>;
  onRemove: (agentId: string) => Promise<void>;
  onUpdate: (agent: AgentConfig) => Promise<void>;
}

export function AgentConfigurator({
  agents,
  apiKeys,
  customProviders = [],
  onAdd,
  onRemove,
  onUpdate,
}: AgentConfiguratorProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [providerId, setProviderId] = useState<string>('');
  const [modelId, setModelId] = useState('');
  const [avatar, setAvatar] = useState('AI');
  const [thinkingValue, setThinkingValue] = useState('');

  const standardProviders = Object.entries(PROVIDERS)
    .filter(([id]) => apiKeys[id])
    .map(([id, provider]) => ({ id, name: provider.name, isCustom: false }));

  const customProviderOptions = customProviders.map((cp) => ({
    id: cp.id,
    name: `${cp.name} (自定义)`,
    isCustom: true,
  }));

  const availableProviders = [...standardProviders, ...customProviderOptions];

  const selectedCustomProvider = customProviders.find((cp) => cp.id === providerId);
  const isCustomProvider = Boolean(selectedCustomProvider);

  const models = (!isCustomProvider && providerId) ? getModels(providerId) : [];
  const customModels = selectedCustomProvider?.models ?? [];
  const showCustomModelInput = isCustomProvider && customModels.length === 0;
  const selectedModel = (!isCustomProvider && providerId && modelId) ? getModel(providerId, modelId) : undefined;
  const thinkingCapability = selectedModel?.thinking ?? selectedModel?.reasoning;
  const thinkingLabel = thinkingCapability?.type === 'effort'
    ? 'Reasoning Effort'
    : thinkingCapability?.type === 'adaptive'
      ? 'Adaptive Thinking'
      : 'Thinking Level';

  const handlePreset = (preset: typeof AGENT_PRESETS[number]) => {
    setName(preset.name);
    setRole(preset.role);
    setSystemPrompt(preset.systemPrompt);
    setAvatar(preset.avatar);
  };

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setRole('');
    setSystemPrompt('');
    setProviderId('');
    setModelId('');
    setAvatar('AI');
    setThinkingValue('');
  };

  const openEditDialog = (agent: AgentConfig) => {
    setEditingId(agent.id);
    setName(agent.name);
    setRole(agent.role);
    setSystemPrompt(agent.systemPrompt);
    setProviderId(agent.providerId);
    setModelId(agent.modelId);
    setAvatar(agent.avatar);
    setThinkingValue(agent.thinking ? String(agent.thinking.value) : '');
    setOpen(true);
  };

  const handleAdd = async () => {
    if (!name || !providerId || !modelId) return;

    const colour = editingId
      ? (agents.find((a) => a.id === editingId)?.colour ?? AGENT_COLOURS[agents.length % AGENT_COLOURS.length])
      : AGENT_COLOURS[agents.length % AGENT_COLOURS.length];

    let thinking: ThinkingConfig | undefined;
    if (thinkingCapability) {
      const effectiveThinkingValue = thinkingValue || thinkingCapability.default;

      thinking = {
        type: thinkingCapability.type,
        value: thinkingCapability.type === 'budget' ? Number(effectiveThinkingValue) : effectiveThinkingValue,
      };
    }

    const agent: AgentConfig = {
      id: editingId ?? nanoid(),
      name,
      role,
      systemPrompt,
      providerId: providerId as ProviderId,
      modelId,
      colour,
      avatar,
      ...(thinking ? { thinking } : {}),
    };

    if (editingId) {
      await onUpdate(agent);
    } else {
      await onAdd(agent);
    }
    setOpen(false);
    resetForm();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{t.agents} ({agents.length})</h3>
        <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) resetForm(); }}>
          <DialogTrigger
            render={<Button size="sm" disabled={availableProviders.length === 0} />}
          >
            {t.addAgent}
          </DialogTrigger>
          <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto p-6">
            <DialogHeader>
              <DialogTitle>{editingId ? (t.editAgent ?? '编辑 Agent') : t.addAgent}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">{t.quickStart}</Label>
                <div className="flex flex-wrap gap-1.5">
                  {AGENT_PRESETS.map((preset) => (
                    <Badge
                      key={preset.name}
                      variant="outline"
                      className="cursor-pointer hover:bg-muted"
                      onClick={() => handlePreset(preset)}
                    >
                      {preset.avatar} {preset.name}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-[auto_1fr] gap-3 items-start">
                <div>
                  <Label htmlFor="avatar">{t.avatar}</Label>
                  <Input
                    id="avatar"
                    value={avatar}
                    onChange={(e) => setAvatar(e.target.value)}
                    className="w-16 text-center text-lg"
                    maxLength={2}
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">{t.avatarNote}</p>
                </div>
                <div>
                  <Label htmlFor="name">{t.name}</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Research Analyst"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">{t.nameNote}</p>
                </div>
              </div>

              <div>
                <Label htmlFor="role">{t.role}</Label>
                <Input
                  id="role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="e.g. Thorough analysis and evidence assessment"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  {t.roleNote}
                </p>
              </div>

              <div>
                <Label htmlFor="provider">{t.provider}</Label>
                <Select value={providerId} onValueChange={(v) => { setProviderId(v ?? ''); setModelId(''); setThinkingValue(''); }}>
                  <SelectTrigger>
                    <SelectValue placeholder={t.selectProvider} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableProviders.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {t.providerNote}
                </p>
              </div>

              {providerId && models.length > 0 && (
                <div>
                  <Label htmlFor="model">{t.model}</Label>
                  <Select value={modelId} onValueChange={(v) => { setModelId(v ?? ''); setThinkingValue(''); }}>
                    <SelectTrigger>
                      <SelectValue placeholder={t.selectModel} />
                    </SelectTrigger>
                    <SelectContent>
                      {models.map((model) => (
                        <SelectItem key={model.id} value={model.id}>
                          {model.name}
                          {model.context && (
                            <span className="text-muted-foreground ml-1">({model.context})</span>
                          )}
                          <span className="text-muted-foreground ml-1 text-xs">
                            [{model.tier}]
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {t.modelNote}
                  </p>
                </div>
              )}

              {isCustomProvider && customModels.length > 0 && (
                <div>
                  <Label htmlFor="custom-model">模型 (Model)</Label>
                  <Select value={modelId} onValueChange={(v) => { setModelId(v ?? ''); }}>
                    <SelectTrigger>
                      <SelectValue placeholder={t.selectModel} />
                    </SelectTrigger>
                    <SelectContent>
                      {customModels.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {t.customModelFrom(selectedCustomProvider?.name ?? '')}
                  </p>
                </div>
              )}

              {showCustomModelInput && (
                <div>
                  <Label htmlFor="custom-model-id">{t.manualModelId}</Label>
                  <Input
                    id="custom-model-id"
                    value={modelId}
                    onChange={(e) => setModelId(e.target.value)}
                    placeholder="deepseek-chat"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {t.manualModelIdNote}
                  </p>
                </div>
              )}

              {thinkingCapability && thinkingCapability.type !== 'budget' && 'values' in thinkingCapability && (
                <div>
                  <Label>{thinkingLabel}</Label>
                  <Select
                    value={thinkingValue || thinkingCapability.default}
                    onValueChange={(v) => setThinkingValue(v ?? '')}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {thinkingCapability.values.map((v: string) => (
                        <SelectItem key={v} value={v}>
                          {v.charAt(0).toUpperCase() + v.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {thinkingCapability && thinkingCapability.type === 'budget' && (
                <div>
                  <Label>Thinking Budget (tokens)</Label>
                  <Input
                    type="number"
                    value={thinkingValue || ''}
                    onChange={(e) => setThinkingValue(e.target.value)}
                    placeholder={`${thinkingCapability.min}–${thinkingCapability.max} (leave blank for default)`}
                    min={thinkingCapability.min}
                    max={thinkingCapability.max}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Range: {thinkingCapability.min.toLocaleString()}–{thinkingCapability.max.toLocaleString()} tokens
                  </p>
                </div>
              )}

              {providerId === 'openrouter' && (
                <div>
                  <Label htmlFor="model-id">Model ID</Label>
                  <Input
                    id="model-id"
                    value={modelId}
                    onChange={(e) => setModelId(e.target.value)}
                    placeholder="e.g. meta-llama/llama-3.1-405b-instruct"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Enter the OpenRouter model ID. Browse models at openrouter.ai/models
                  </p>
                </div>
              )}

              <div>
                <Label htmlFor="system-prompt">{t.systemPrompt}</Label>
                <Textarea
                  id="system-prompt"
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder={t.systemPromptPlaceholder}
                  rows={6}
                />
              </div>

              <Button onClick={handleAdd} disabled={!name || !providerId || !modelId} className="w-full">
                {editingId ? (t.save ?? '保存') : t.addAgent}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {availableProviders.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {t.needApiKeyFirst}
        </p>
      )}

      <div className="space-y-2">
        {agents.map((agent) => (
          <Card key={agent.id}>
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm"
                    style={{ backgroundColor: agent.colour }}
                  >
                    {agent.avatar}
                  </span>
                  <div>
                    <CardTitle className="text-sm">{agent.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">{agent.role}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => openEditDialog(agent)}
                  >
                    {t.edit}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => onRemove(agent.id)}
                  >
                    {t.remove}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <div className="flex gap-2">
                <Badge variant="outline" className="text-xs">
                  {PROVIDERS[agent.providerId]?.name ?? agent.providerId}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {agent.modelId}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
