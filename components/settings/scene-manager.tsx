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
        <div>
          <h3 className="text-base font-semibold">讨论场景 ({scenes.length})</h3>
          <p className="text-xs text-muted-foreground">
            定义群组讨论场景、交流机制与参与的智能体，开始研讨时一键切换。
          </p>
        </div>
        <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) resetForm(); }}>
          <DialogTrigger render={<Button size="sm" className="gap-1.5 cursor-pointer" />}>
            <span className="text-sm">+</span>
            <span>新建场景</span>
          </DialogTrigger>
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
                    placeholder="例如：技术方案评审、辩论交锋"
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
                      className="h-7 text-xs cursor-pointer"
                      onClick={() => setMode(m.value)}
                    >
                      {m.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="mb-2 block">选择参与成员（{selectedAgentIds.length}）</Label>
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
                            'flex items-center gap-2 rounded-lg border p-2 text-left transition-all cursor-pointer select-none',
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

              <Button onClick={handleSave} disabled={!name.trim()} className="w-full cursor-pointer">
                {t.save}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {scenes.length === 0 ? (
        <Card className="border-dashed bg-muted/10">
          <CardContent className="py-10 text-center space-y-2">
            <p className="text-sm font-semibold">暂无自定义讨论场景</p>
            <p className="text-xs text-muted-foreground">
              新建一个场景，把常用的一组智能体角色与交流机制组合起来，对话时一键切换。
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {scenes.map((scene) => {
            const members = (scene.agentIds ?? [])
              .map((id) => agents.find((a) => a.id === id))
              .filter((a): a is AgentConfig => Boolean(a));
            const modeLabel = MODES.find((m) => m.value === scene.mode)?.label ?? scene.mode;

            return (
              <Card key={scene.id} className="rounded-xl border hover:border-primary/40 transition-colors shadow-2xs">
                <CardHeader className="py-3 px-4 pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span className="text-2xl shrink-0 mt-0.5">{scene.emoji ?? '🎭'}</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-sm font-bold truncate">{scene.name}</CardTitle>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                            {modeLabel}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {scene.description || `${members.length} 位在群成员`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs cursor-pointer"
                        onClick={() => openEditDialog(scene)}
                      >
                        {t.edit}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-destructive hover:text-destructive cursor-pointer"
                        onClick={() => handleDelete(scene.id)}
                      >
                        {t.remove}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-3 pt-0">
                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    <span className="text-[11px] text-muted-foreground mr-1">成员:</span>
                    {members.map((m) => (
                      <Badge key={m.id} variant="secondary" className="text-xs gap-1 py-0.5">
                        <span
                          className="flex h-3.5 w-3.5 items-center justify-center rounded-full text-[8px] text-white shrink-0"
                          style={{ backgroundColor: m.colour }}
                        >
                          {m.avatar}
                        </span>
                        <span>{m.name}</span>
                      </Badge>
                    ))}
                    {members.length === 0 && (
                      <span className="text-xs text-muted-foreground">暂未分配成员</span>
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
