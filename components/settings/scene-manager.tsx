'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { nanoid } from 'nanoid';
import { useI18n } from '@/lib/i18n';
import type { Scene } from '@/lib/types/scene';
import type { ConversationMode } from '@/lib/types/council';
import type { AgentConfig } from '@/lib/types/agents';
import { cn } from '@/lib/utils';

interface SceneManagerProps {
  scenes: Scene[];
  agents: AgentConfig[];
  onSave: (scenes: Scene[]) => Promise<void>;
}

const MODES: { value: ConversationMode; label: string }[] = [
  { value: 'council', label: '议会交锋' },
  { value: 'round-robin', label: '轮流发言' },
  { value: 'free-chat', label: '自由群聊' },
];

export function SceneManager({ scenes, agents, onSave }: SceneManagerProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('');
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState<ConversationMode>('free-chat');
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setEmoji('');
    setDescription('');
    setMode('free-chat');
    setSelectedAgentIds([]);
  };

  const openEditDialog = (scene: Scene) => {
    setEditingId(scene.id);
    setName(scene.name);
    setEmoji(scene.emoji ?? '');
    setDescription(scene.description ?? '');
    setMode(scene.mode);
    setSelectedAgentIds(scene.agentIds);
    setOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    const scene: Scene = {
      id: editingId ?? nanoid(),
      name: name.trim(),
      ...(emoji.trim() ? { emoji: emoji.trim() } : {}),
      mode,
      ...(description.trim() ? { description: description.trim() } : {}),
      agentIds: selectedAgentIds,
    };
    const next = editingId
      ? scenes.map((s) => (s.id === editingId ? scene : s))
      : [...scenes, scene];
    await onSave(next);
    setOpen(false);
    resetForm();
  };

  const handleDelete = async (id: string) => {
    await onSave(scenes.filter((s) => s.id !== id));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">场景 (Scenes) ({scenes.length})</h3>
        <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) resetForm(); }}>
          <DialogTrigger render={<Button size="sm" />}>新建场景</DialogTrigger>
          <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto p-6">
            <DialogHeader>
              <DialogTitle>{editingId ? '编辑场景' : '新建场景'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-[auto_1fr] gap-3 items-start">
                <div>
                  <Label htmlFor="scene-emoji">图标</Label>
                  <Input
                    id="scene-emoji"
                    value={emoji}
                    onChange={(e) => setEmoji(e.target.value)}
                    className="w-16 text-center text-lg"
                    maxLength={2}
                    placeholder="🎭"
                  />
                </div>
                <div>
                  <Label htmlFor="scene-name">名称</Label>
                  <Input
                    id="scene-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="例如：旅游团、辩论场"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="scene-desc">描述</Label>
                <Input
                  id="scene-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="一句话描述这个场景"
                />
              </div>

              <div>
                <Label>默认讨论模式</Label>
                <div className="flex gap-2 mt-1.5">
                  {MODES.map((m) => (
                    <Button
                      key={m.value}
                      size="sm"
                      variant={mode === m.value ? 'default' : 'outline'}
                      className="h-7 text-xs"
                      onClick={() => setMode(m.value)}
                    >
                      {m.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="mb-2 block">选择成员（{selectedAgentIds.length}）</Label>
                <div className="max-h-56 overflow-y-auto rounded-lg border bg-muted/20 p-2.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {agents.map((agent) => {
                      const isSelected = selectedAgentIds.includes(agent.id);
                      return (
                        <button
                          key={agent.id}
                          type="button"
                          onClick={() =>
                            setSelectedAgentIds(
                              isSelected
                                ? selectedAgentIds.filter((id) => id !== agent.id)
                                : [...selectedAgentIds, agent.id],
                            )
                          }
                          className={cn(
                            'flex items-center gap-2 rounded-lg border p-2 text-left transition-all',
                            isSelected
                              ? 'border-primary/60 bg-primary/10'
                              : 'border-transparent opacity-50 hover:opacity-80 hover:bg-muted/40',
                          )}
                        >
                          <span
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-medium text-white"
                            style={{ backgroundColor: agent.colour }}
                          >
                            {agent.avatar}
                          </span>
                          <span className="truncate text-xs font-medium">{agent.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <Button onClick={handleSave} disabled={!name.trim()} className="w-full">
                {t.save}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {scenes.length === 0 && (
        <p className="text-sm text-muted-foreground">
          还没有场景。新建一个场景，把常用的一组角色组合起来，建群时一键拉入。
        </p>
      )}

      <div className="space-y-2">
        {scenes.map((scene) => {
          const members = scene.agentIds
            .map((id) => agents.find((a) => a.id === id))
            .filter((a): a is AgentConfig => Boolean(a));
          const modeLabel = MODES.find((m) => m.value === scene.mode)?.label ?? scene.mode;

          return (
            <Card key={scene.id}>
              <CardHeader className="pb-2 pt-4 px-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xl shrink-0">{scene.emoji ?? '🎭'}</span>
                    <div className="min-w-0">
                      <CardTitle className="text-sm">{scene.name}</CardTitle>
                      <p className="text-xs text-muted-foreground truncate">
                        {scene.description || modeLabel}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Badge variant="outline" className="text-xs">
                      {modeLabel}
                    </Badge>
                    <Button size="sm" variant="ghost" onClick={() => openEditDialog(scene)}>
                      {t.edit}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(scene.id)}
                    >
                      {t.remove}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <div className="flex flex-wrap gap-1.5">
                  {members.map((m) => (
                    <Badge key={m.id} variant="secondary" className="text-xs gap-1">
                      <span
                        className="flex h-4 w-4 items-center justify-center rounded-full text-[8px] text-white"
                        style={{ backgroundColor: m.colour }}
                      >
                        {m.avatar}
                      </span>
                      {m.name}
                    </Badge>
                  ))}
                  {members.length === 0 && (
                    <span className="text-xs text-muted-foreground">还没有成员</span>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
