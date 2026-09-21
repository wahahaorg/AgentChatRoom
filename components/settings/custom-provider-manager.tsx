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
  DialogTrigger,
} from '@/components/ui/dialog';
import { Plus, Server, CheckCircle2, AlertCircle, Loader2, Trash2, Pencil } from 'lucide-react';
import { nanoid } from 'nanoid';
import { useI18n } from '@/lib/i18n';
import type { CustomProviderConfig } from '@/lib/types/config';

interface CustomProviderManagerProps {
  customProviders: CustomProviderConfig[];
  onSaveProvider: (provider: CustomProviderConfig) => Promise<void>;
  onRemoveProvider: (providerId: string) => Promise<void>;
  onTestProvider: (
    providerId: string,
    apiKey: string,
    baseURL: string,
  ) => Promise<{ success: boolean; error?: string }>;
}

const TEMPLATES: Array<{
  name: string;
  baseURL: string;
  models: string;
  desc: string;
}> = [
  {
    name: 'DeepSeek',
    baseURL: 'https://api.deepseek.com/v1',
    models: 'deepseek-chat, deepseek-reasoner',
    desc: 'DeepSeek 官方 API',
  },
  {
    name: '本地 Ollama',
    baseURL: 'http://localhost:11434/v1',
    models: 'llama3.3, qwen2.5, deepseek-r1',
    desc: '本地运行无需 Key',
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
    name: 'Kimi (Moonshot)',
    baseURL: 'https://api.moonshot.cn/v1',
    models: 'moonshot-v1-8k, moonshot-v1-32k',
    desc: '月之暗面 Kimi',
  },
];

export function CustomProviderManager({
  customProviders,
  onSaveProvider,
  onRemoveProvider,
  onTestProvider,
}: CustomProviderManagerProps) {
  const { t } = useI18n();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [baseURL, setBaseURL] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [modelsInput, setModelsInput] = useState('');

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);

  const openAddDialog = () => {
    setEditingId(null);
    setName('');
    setBaseURL('');
    setApiKey('');
    setModelsInput('');
    setTestResult(null);
    setDialogOpen(true);
  };

  const openEditDialog = (provider: CustomProviderConfig) => {
    setEditingId(provider.id);
    setName(provider.name);
    setBaseURL(provider.baseURL);
    setApiKey(provider.apiKey ?? '');
    setModelsInput(provider.models.join(', '));
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
      const res = await onTestProvider(editingId ?? 'temp-custom', apiKey.trim(), baseURL.trim());
      setTestResult(res);
    } catch (err) {
      setTestResult({
        success: false,
        error: err instanceof Error ? err.message : 'Connection failed',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim() || !baseURL.trim()) return;

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

    await onSaveProvider(provider);
    setDialogOpen(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">{t.customApiTitle}</h3>
          <p className="text-xs text-muted-foreground">
            {t.customApiNote}
          </p>
        </div>
        <Button size="sm" onClick={openAddDialog} className="gap-1.5">
          <Plus className="h-4 w-4" />
          {t.addCustomApi}
        </Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto p-6">
          <DialogHeader>
            <DialogTitle>{editingId ? t.editCustomApi : t.addCustomApi}</DialogTitle>
            <DialogDescription>
              {t.customApiNote}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">{t.quickTemplates}</Label>
              <div className="flex flex-wrap gap-1.5">
                {TEMPLATES.map((tpl) => (
                  <Badge
                    key={tpl.name}
                    variant="outline"
                    className="cursor-pointer hover:bg-muted text-xs py-1"
                    onClick={() => applyTemplate(tpl)}
                  >
                    {tpl.name}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="custom-name">{t.providerName} <span className="text-destructive">*</span></Label>
              <Input
                id="custom-name"
                placeholder={t.providerNamePlaceholder}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="custom-base-url">{t.baseUrl} <span className="text-destructive">*</span></Label>
              <Input
                id="custom-base-url"
                placeholder="https://api.deepseek.com/v1"
                value={baseURL}
                onChange={(e) => setBaseURL(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                {t.baseUrlNote}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="custom-api-key">{t.apiKeyField}</Label>
              <Input
                id="custom-api-key"
                type="password"
                placeholder={t.apiKeyPlaceholder}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="custom-models">{t.modelsField}</Label>
              <Input
                id="custom-models"
                placeholder="deepseek-chat, deepseek-reasoner"
                value={modelsInput}
                onChange={(e) => setModelsInput(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                {t.modelsNote}
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
                    <span>{t.connectionOk}</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{t.connectionFailed}{testResult.error}</span>
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
                className="gap-1.5"
              >
                {testing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {testing ? t.testing : t.testConnection}
              </Button>
              <Button
                type="button"
                onClick={handleSave}
                disabled={!name.trim() || !baseURL.trim()}
                className="flex-1"
              >
                {t.saveConfig}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {customProviders.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            <Server className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>{t.noCustomApi}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {customProviders.map((cp) => (
            <Card key={cp.id} className="rounded-lg">
              <CardHeader className="py-3 px-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary font-semibold text-xs ring-1 ring-border/70">
                      API
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-sm font-semibold">{cp.name}</CardTitle>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                          {t.openaiCompatible}
                        </Badge>
                      </div>
                      <CardDescription className="text-xs truncate font-mono mt-0.5">
                        {cp.baseURL}
                      </CardDescription>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => openEditDialog(cp)}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1" />
                      {t.edit}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                      onClick={() => onRemoveProvider(cp.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-3 pt-0">
                <div className="flex flex-wrap gap-1 mt-1">
                  {cp.models.map((m) => (
                    <Badge key={m} variant="outline" className="text-[11px] font-normal py-0">
                      {m}
                    </Badge>
                  ))}
                  {cp.apiKey && (
                    <span className="text-[11px] text-muted-foreground ml-auto self-center font-mono">
                      Key: {cp.apiKey}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
