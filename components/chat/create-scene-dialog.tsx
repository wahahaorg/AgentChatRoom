'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { nanoid } from 'nanoid';
import { useI18n } from '@/lib/i18n';
import type { Scene } from '@/lib/types/scene';
import type { ConversationMode } from '@/lib/types/council';
import type { AgentConfig } from '@/lib/types/agents';
import { Check, CheckSquare, Square, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CreateSceneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agents: AgentConfig[];
  onSceneCreated: (scene: Scene) => Promise<void> | void;
}

export function CreateSceneDialog({
  open,
  onOpenChange,
  agents,
  onSceneCreated,
}: CreateSceneDialogProps) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🎯');
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState<ConversationMode>('free-chat');
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName('');
      setEmoji('🎯');
      setDescription('');
      setMode('free-chat');
      setSelectedAgentIds(agents.map((a) => a.id));
    }
  }, [open, agents]);

  const toggleAgent = (id: string) => {
    setSelectedAgentIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    setSelectedAgentIds(agents.map((a) => a.id));
  };

  const handleDeselectAll = () => {
    setSelectedAgentIds([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || saving) return;

    setSaving(true);
    try {
      const newScene: Scene = {
        id: nanoid(),
        name: name.trim(),
        emoji: emoji.trim() || '🎯',
        mode,
        description: description.trim() || undefined,
        agentIds: selectedAgentIds,
      };

      await onSceneCreated(newScene);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const MODES: { value: ConversationMode; label: string; desc: string; icon: string }[] = [
    { value: 'council', label: t.council, desc: t.councilModeDesc, icon: '⚖️' },
    { value: 'round-robin', label: t.roundRobin, desc: t.roundRobinModeDesc, icon: '🔄' },
    { value: 'free-chat', label: t.freeChat, desc: t.freeChatModeDesc, icon: '💬' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary text-sm">
              <Sparkles className="h-4 w-4" />
            </span>
            <span>新建讨论场景</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            设定一个专属研讨场景，定义参与探讨的角色与默认交流机制。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Icon & Name */}
          <div className="grid grid-cols-[auto_1fr] gap-3 items-start">
            <div className="space-y-1.5">
              <Label htmlFor="create-scene-emoji" className="text-xs">
                图标
              </Label>
              <Input
                id="create-scene-emoji"
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                className="w-16 text-center text-lg h-9"
                maxLength={2}
                placeholder="🎯"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="create-scene-name" className="text-xs">
                场景名称 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="create-scene-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：投资理财分析、产品发布复盘"
                className="h-9"
                autoFocus
                required
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="create-scene-desc" className="text-xs">
              场景描述（可选）
            </Label>
            <Input
              id="create-scene-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="一句话说明该场景的目标或讨论背景"
              className="h-9"
            />
          </div>

          {/* Discussion Mode inside Scene */}
          <div className="space-y-2">
            <Label className="text-xs">场景交流机制</Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {MODES.map((m) => {
                const selected = mode === m.value;
                return (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setMode(m.value)}
                    className={cn(
                      'flex flex-col items-start rounded-lg border p-2.5 text-left transition-all cursor-pointer',
                      selected
                        ? 'border-primary bg-primary/5 text-foreground ring-1 ring-primary/30 shadow-xs'
                        : 'border-border/70 bg-card hover:border-primary/40 hover:bg-muted/30 text-muted-foreground'
                    )}
                  >
                    <div className="flex items-center gap-1.5 font-medium text-xs text-foreground">
                      <span>{m.icon}</span>
                      <span>{m.label}</span>
                    </div>
                    <p className="mt-1 text-[11px] leading-tight text-muted-foreground line-clamp-2">
                      {m.desc}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Select Members */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">
                参与成员 ({selectedAgentIds.length}/{agents.length})
              </Label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="text-xs text-primary hover:underline font-medium inline-flex items-center gap-1"
                >
                  <CheckSquare className="h-3 w-3" />
                  {t.selectAll}
                </button>
                <span className="text-muted-foreground/40 text-xs">|</span>
                <button
                  type="button"
                  onClick={handleDeselectAll}
                  className="text-xs text-muted-foreground hover:text-foreground hover:underline inline-flex items-center gap-1"
                >
                  <Square className="h-3 w-3" />
                  {t.deselectAll}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1 border rounded-lg bg-muted/20">
              {agents.map((agent) => {
                const isSelected = selectedAgentIds.includes(agent.id);
                return (
                  <div
                    key={agent.id}
                    onClick={() => toggleAgent(agent.id)}
                    className={cn(
                      'flex items-center gap-2 rounded-lg border px-2.5 py-1.5 cursor-pointer transition-colors text-xs',
                      isSelected
                        ? 'border-primary/50 bg-background shadow-xs'
                        : 'border-transparent bg-transparent opacity-60 hover:opacity-90'
                    )}
                  >
                    <div
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold text-white"
                      style={{ backgroundColor: agent.colour }}
                    >
                      {agent.avatar}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground">{agent.name}</p>
                      <p className="truncate text-[10px] text-muted-foreground">{agent.role}</p>
                    </div>
                    <div
                      className={cn(
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                        isSelected
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-muted-foreground/30'
                      )}
                    >
                      {isSelected && <Check className="h-2.5 w-2.5" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              {t.cancel}
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!name.trim() || saving || selectedAgentIds.length === 0}
            >
              {saving ? '保存中...' : '创建并应用场景'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

