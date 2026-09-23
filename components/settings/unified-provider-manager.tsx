'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Plus,
  Server,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
  Pencil,
  Zap,
  Globe,
  Radio,
} from 'lucide-react';
import { nanoid } from 'nanoid';
import { useI18n } from '@/lib/i18n';
import type { CustomProviderConfig, ProviderId } from '@/lib/types/config';
import { PROVIDERS } from '@/lib/providers/provider-registry';

interface UnifiedProviderManagerProps {
  apiKeys: Partial<Record<ProviderId, string>>;
  customProviders: CustomProviderConfig[];
  onSaveApiKey: (providerId: ProviderId, apiKey: string) => Promise<void>;
  onRemoveApiKey: (providerId: ProviderId) => Promise<void>;
  onTestApiKey: (providerId: ProviderId, apiKey: string) => Promise<{ success: boolean; error?: string }>;
  onSaveCustomProvider: (provider: CustomProviderConfig) => Promise<void>;
  onRemoveCustomProvider: (providerId: string) => Promise<void>;
  onTestCustomProvider: (
    providerId: string,
    apiKey: string,
    baseURL: string,
  ) => Promise<{ success: boolean; error?: string }>;
}

const TEMPLATES = [
  {
    name: 'DeepSeek',
    baseURL: 'https://api.deepseek.com/v1',
    models: 'deepseek-chat, deepseek-reasoner',
    desc: 'DeepSeek 官方 API',
  },
  {
    name: 'SiliconFlow 硅基流动',
    baseURL: 'https://api.siliconflow.cn/v1',
    models: 'deepseek-ai/DeepSeek-V3, deepseek-ai/DeepSeek-R1',
    desc: '多模型聚合高速推理',
  },
  {
    name: '通义千问 (DashScope)',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: 'qwen-max, qwen-plus, qwen-turbo',
    desc: '阿里千问兼容接口',
  },
  {
    name: '本地 Ollama',
    baseURL: 'http://localhost:11434/v1',
    models: 'llama3.3, qwen2.5, deepseek-r1',
    desc: '本地运行无需 Key',
  },
  {
    name: 'Kimi (Moonshot)',
    baseURL: 'https://api.moonshot.cn/v1',
    models: 'moonshot-v1-8k, moonshot-v1-32k',
    desc: '月之暗面 Kimi',
  },
  {
    name: 'OpenAI 官方/中转',
    baseURL: 'https://api.openai.com/v1',
    models: 'gpt-4o, gpt-4o-mini, o3-mini',
    desc: 'OpenAI 兼容接口',
  },
];

export function UnifiedProviderManager({
  apiKeys,
  customProviders,
  onSaveApiKey,
  onRemoveApiKey,
  onTestApiKey,
  onSaveCustomProvider,
  onRemoveCustomProvider,
  onTestCustomProvider,
}: UnifiedProviderManagerProps) {
  const { t } = useI18n();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isOfficialEditing, setIsOfficialEditing] = useState<ProviderId | null>(null);

  const [name, setName] = useState('');
  const [baseURL, setBaseURL] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [modelsInput, setModelsInput] = useState('');

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);

  // Quick card testing status
  const [testingCardId, setTestingCardId] = useState<string | null>(null);
  const [cardTestResults, setCardTestResults] = useState<Record<string, { success: boolean; error?: string }>>({});

  // Configured official providers
  const configuredOfficialProviders = (Object.entries(PROVIDERS) as [ProviderId, typeof PROVIDERS[ProviderId]][])
    .filter(([id]) => Boolean(apiKeys[id]?.trim()));

  const totalConfigured = configuredOfficialProviders.length + customProviders.length;

  const openAddDialog = () => {
    setEditingId(null);
    setIsOfficialEditing(null);
    setName('');
    setBaseURL('');
    setApiKey('');
    setModelsInput('');
    setTestResult(null);
    setDialogOpen(true);
  };

  const openEditCustomDialog = (provider: CustomProviderConfig) => {
    setEditingId(provider.id);
    setIsOfficialEditing(null);
    setName(provider.name);
    setBaseURL(provider.baseURL);
    setApiKey(provider.apiKey ?? '');
    setModelsInput(provider.models.join(', '));
    setTestResult(null);
    setDialogOpen(true);
  };

  const openEditOfficialDialog = (id: ProviderId) => {
    const provider = PROVIDERS[id];
    setEditingId(id);
    setIsOfficialEditing(id);
    setName(provider.name);
    setBaseURL(id === 'openrouter' ? 'https://openrouter.ai/api/v1' : `https://api.${id}.com/v1`);
    setApiKey(apiKeys[id] ?? '');
    setModelsInput(Array.isArray(provider.models) ? provider.models.map((m) => m.id).join(', ') : '全量动态模型');
    setTestResult(null);
    setDialogOpen(true);
  };

  const applyTemplate = (tpl: typeof TEMPLATES[number]) => {
    setName(tpl.name);
    setBaseURL(tpl.baseURL);
    setModelsInput(tpl.models);
  };

  const handleTest = async () => {
    if (!baseURL.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      if (isOfficialEditing) {
        const res = await onTestApiKey(isOfficialEditing, apiKey.trim());
        setTestResult(res);
      } else {
        const res = await onTestCustomProvider(editingId ?? 'temp-custom', apiKey.trim(), baseURL.trim());
        setTestResult(res);
      }
    } catch (err) {
      setTestResult({
        success: false,
        error: err instanceof Error ? err.message : '连接测试失败',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleCardTest = async (id: string, isOfficial: boolean, key: string, url?: string) => {
    setTestingCardId(id);
    try {
      if (isOfficial) {
        const res = await onTestApiKey(id as ProviderId, key);
        setCardTestResults((prev) => ({ ...prev, [id]: res }));
      } else if (url) {
        const res = await onTestCustomProvider(id, key, url);
        setCardTestResults((prev) => ({ ...prev, [id]: res }));
      }
    } finally {
      setTestingCardId(null);
    }
  };

  const handleSave = async () => {
    if (!name.trim() || !baseURL.trim()) return;

    if (isOfficialEditing) {
      await onSaveApiKey(isOfficialEditing, apiKey.trim());
      setDialogOpen(false);
      return;
    }

    const parsedModels = modelsInput
      .split(/[,，\n]/)
      .map((m) => m.trim())
      .filter((m) => m.length > 0);

    const provider: CustomProviderConfig = {
      id: editingId ?? `custom-${nanoid(8)}`,
      name: name.trim(),
      baseURL: baseURL.trim().replace(/\/+$/, ''),
      apiKey: apiKey.trim(),
      models: parsedModels.length > 0 ? parsedModels : ['default'],
    };

    await onSaveCustomProvider(provider);
    setDialogOpen(false);
  };

  return (
    <div className="space-y-4">
      {/* Top Header Controls */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">已接入服务商 ({totalConfigured})</h3>
          <p className="text-xs text-muted-foreground">
            接入模型 API 后，可在智能体配置中选用对应的 AI 模型。密钥仅保存在本地设备。
          </p>
        </div>
        <Button size="sm" onClick={openAddDialog} className="gap-1.5 cursor-pointer">
          <Plus className="h-4 w-4" />
          <span>添加服务商</span>
        </Button>
      </div>

      {/* Add / Edit Provider Modal */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto p-6">
          <DialogHeader>
            <DialogTitle>{editingId ? '编辑服务商' : '添加模型服务商'}</DialogTitle>
            <DialogDescription>
              配置 OpenAI 兼容端点（如 DeepSeek、通义千问、硅基流动、Ollama 或自建代理）。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {!editingId && (
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">常用模板快速填入</Label>
                <div className="flex flex-wrap gap-1.5">
                  {TEMPLATES.map((tpl) => (
                    <Badge
                      key={tpl.name}
                      variant="outline"
                      className="cursor-pointer hover:bg-primary/10 hover:border-primary/50 text-xs py-1 transition-colors"
                      onClick={() => applyTemplate(tpl)}
                    >
                      {tpl.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="provider-name">服务商名称 <span className="text-destructive">*</span></Label>
              <Input
                id="provider-name"
                placeholder="例如：DeepSeek 官方、硅基流动"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="provider-base-url">API 端点 (Base URL) <span className="text-destructive">*</span></Label>
              <Input
                id="provider-base-url"
                placeholder="https://api.deepseek.com/v1"
                value={baseURL}
                onChange={(e) => setBaseURL(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground font-mono">
                需符合 OpenAI /v1 兼容格式规范
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="provider-api-key">API 密钥 (API Key)</Label>
              <Input
                id="provider-api-key"
                type="password"
                placeholder="sk-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="provider-models">支持的模型列表</Label>
              <Input
                id="provider-models"
                placeholder="deepseek-chat, deepseek-reasoner"
                value={modelsInput}
                onChange={(e) => setModelsInput(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                多个模型用逗号分隔，配置后创建智能体时可直接在下拉列表中选用。
              </p>
            </div>

            {testResult && (
              <div
                className={`flex items-start gap-2 p-2.5 rounded-md text-xs ${
                  testResult.success
                    ? 'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20'
                    : 'bg-destructive/10 text-destructive border border-destructive/20'
                }`}
              >
                {testResult.success ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>服务商连接正常，API 密钥验证通过！</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>连接失败：{testResult.error}</span>
                  </>
                )}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleTest}
                disabled={testing || !baseURL.trim()}
                className="gap-1.5 cursor-pointer"
              >
                {testing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {testing ? '测试中...' : '测试连接'}
              </Button>
              <Button
                type="button"
                onClick={handleSave}
                disabled={!name.trim() || !baseURL.trim()}
                className="flex-1 cursor-pointer"
              >
                保存配置
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Provider List / Empty State */}
      {totalConfigured === 0 ? (
        <Card className="border-dashed bg-muted/10">
          <CardContent className="py-10 text-center space-y-3">
            <Server className="h-10 w-10 mx-auto text-muted-foreground/50" />
            <div className="space-y-1">
              <h4 className="text-sm font-semibold">暂未接入任何模型服务商</h4>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                添加服务商并输入 API 密钥后，即可为智能体分配对应的大模型进行协同讨论。
              </p>
            </div>
            <Button size="sm" onClick={openAddDialog} className="gap-1.5 cursor-pointer">
              <Plus className="h-4 w-4" />
              <span>立即添加服务商</span>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {/* Configured Official Providers */}
          {configuredOfficialProviders.map(([id, provider]) => {
            const key = apiKeys[id]!;
            const testRes = cardTestResults[id];
            const isTesting = testingCardId === id;

            return (
              <Card key={id} className="rounded-xl border hover:border-primary/40 transition-colors shadow-2xs">
                <CardHeader className="py-3 px-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold text-xs ring-1 ring-border/60">
                        {id === 'openai' ? 'OA' : id === 'anthropic' ? 'A' : id === 'google' ? 'G' : 'OR'}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-sm font-bold">{provider.name}</CardTitle>
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                            官方直连
                          </Badge>
                          <span className="flex items-center gap-1 text-[11px] text-green-600 dark:text-green-400 font-medium">
                            <span className="h-1.5 w-1.5 rounded-full bg-green-500"></span>
                            已就绪
                          </span>
                        </div>
                        <CardDescription className="text-xs font-mono mt-0.5 text-muted-foreground truncate">
                          Key: {key.slice(0, 7)}...{key.slice(-4)}
                        </CardDescription>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2.5 text-xs cursor-pointer"
                        disabled={isTesting}
                        onClick={() => handleCardTest(id, true, key)}
                      >
                        {isTesting && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                        测试连接
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs cursor-pointer"
                        onClick={() => openEditOfficialDialog(id)}
                      >
                        <Pencil className="h-3.5 w-3.5 mr-1" />
                        编辑
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-destructive hover:text-destructive cursor-pointer"
                        onClick={() => onRemoveApiKey(id)}
                        title="移除此服务商密钥"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-3 pt-0">
                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    <span className="text-[11px] text-muted-foreground mr-1">可用模型:</span>
                    {Array.isArray(provider.models) ? (
                      provider.models.map((m) => (
                        <Badge key={m.id} variant="outline" className="text-[11px] font-normal py-0">
                          {m.name}
                        </Badge>
                      ))
                    ) : (
                      <Badge variant="outline" className="text-[11px] font-normal py-0">
                        全量动态模型
                      </Badge>
                    )}
                    {testRes && (
                      <span className={`text-[11px] ml-auto font-medium ${testRes.success ? 'text-green-600' : 'text-destructive'}`}>
                        {testRes.success ? '✓ 验证通过' : `✕ ${testRes.error}`}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {/* Configured Custom Providers */}
          {customProviders.map((cp) => {
            const testRes = cardTestResults[cp.id];
            const isTesting = testingCardId === cp.id;

            return (
              <Card key={cp.id} className="rounded-xl border hover:border-primary/40 transition-colors shadow-2xs">
                <CardHeader className="py-3 px-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-foreground font-bold text-xs ring-1 ring-border/60">
                        API
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-sm font-bold">{cp.name}</CardTitle>
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                            OpenAI 兼容
                          </Badge>
                          <span className="flex items-center gap-1 text-[11px] text-green-600 dark:text-green-400 font-medium">
                            <span className="h-1.5 w-1.5 rounded-full bg-green-500"></span>
                            已就绪
                          </span>
                        </div>
                        <CardDescription className="text-xs truncate font-mono mt-0.5 text-muted-foreground">
                          {cp.baseURL}
                        </CardDescription>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2.5 text-xs cursor-pointer"
                        disabled={isTesting}
                        onClick={() => handleCardTest(cp.id, false, cp.apiKey ?? '', cp.baseURL)}
                      >
                        {isTesting && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                        测试连接
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs cursor-pointer"
                        onClick={() => openEditCustomDialog(cp)}
                      >
                        <Pencil className="h-3.5 w-3.5 mr-1" />
                        编辑
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-destructive hover:text-destructive cursor-pointer"
                        onClick={() => onRemoveCustomProvider(cp.id)}
                        title="删除此服务商"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-3 pt-0">
                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    <span className="text-[11px] text-muted-foreground mr-1">挂载模型:</span>
                    {cp.models.map((m) => (
                      <Badge key={m} variant="outline" className="text-[11px] font-normal py-0">
                        {m}
                      </Badge>
                    ))}
                    {cp.apiKey && (
                      <span className="text-[11px] text-muted-foreground font-mono ml-2">
                        (Key: {cp.apiKey.length > 8 ? `${cp.apiKey.slice(0, 4)}...${cp.apiKey.slice(-3)}` : '已配置'})
                      </span>
                    )}
                    {testRes && (
                      <span className={`text-[11px] ml-auto font-medium ${testRes.success ? 'text-green-600' : 'text-destructive'}`}>
                        {testRes.success ? '✓ 验证通过' : `✕ ${testRes.error}`}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
