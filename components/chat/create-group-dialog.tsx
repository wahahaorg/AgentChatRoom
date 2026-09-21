'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { AgentConfig } from '@/lib/types/agents';
import type { ConversationMode } from '@/lib/types/council';
import { Users, Check, MessageSquare, RefreshCw, Sparkles, CheckSquare, Square } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

interface CreateGroupDialogProps {
  agents: AgentConfig[];
  defaultMode?: ConversationMode;
}

export function CreateGroupDialog({ agents, defaultMode = 'council' }: CreateGroupDialogProps) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [mode, setMode] = useState<ConversationMode>(defaultMode);
  const [primaryAgentId, setPrimaryAgentId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (open) {
      setSelectedIds(agents.map((a) => a.id));
      setPrimaryAgentId(agents[0]?.id ?? null);
      setMode(defaultMode);
    }
  }, [open, agents, defaultMode]);

  const toggleAgent = (id: string) => {
    if (selectedIds.includes(id)) {
      // If deselecting the current primary agent, transfer primary to another selected agent if possible
      if (id === primaryAgentId) {
        const remaining = selectedIds.filter((sid) => sid !== id);
        setPrimaryAgentId(remaining[0] ?? null);
      }
      setSelectedIds(selectedIds.filter((sid) => sid !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
      if (!primaryAgentId) {
        setPrimaryAgentId(id);
      }
    }
  };

  const handleSelectAll = () => {
    const allIds = agents.map((a) => a.id);
    setSelectedIds(allIds);
    if (!primaryAgentId && allIds.length > 0) {
      setPrimaryAgentId(allIds[0]);
    }
  };

  const handleDeselectAll = () => {
    setSelectedIds([]);
    setPrimaryAgentId(null);
  };

  const needsPrimary = mode !== 'free-chat';
  const canCreate = selectedIds.length > 0 && (!needsPrimary || primaryAgentId) && !creating;

  const handleCreate = async () => {
    if (!canCreate) return;
    setCreating(true);
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || (locale === 'zh' ? '新群聊' : 'New group chat'),
          mode,
          primaryAgentId: needsPrimary ? primaryAgentId : (selectedIds[0] ?? null),
          agentIds: selectedIds,
        }),
      });
      if (!res.ok) throw new Error('Failed to create');
      const conv = await res.json();
      setOpen(false);
      router.push(`/chat/${conv.id}`);
    } catch {
      // Keep dialog open on failure
    } finally {
      setCreating(false);
    }
  };

  const primaryAgent = agents.find((a) => a.id === primaryAgentId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            disabled={agents.length === 0}
            className={cn(
              'h-10 rounded-lg border border-border/70 bg-background shadow-sm transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-foreground w-full justify-start gap-2.5 px-3 text-sm font-medium'
            )}
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
              <Users className="h-3.5 w-3.5" strokeWidth={2.4} />
            </span>
            {t.newGroupChat}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto p-6 gap-5">
        <DialogHeader className="gap-1.5 pb-1 border-b">
          <DialogTitle className="text-lg font-semibold flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/15 text-primary">
              <Users className="h-3.5 w-3.5" />
            </span>
            {t.createGroup}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
            {t.createGroupDesc}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Group Title */}
          <div className="space-y-1.5">
            <Label htmlFor="group-title" className="text-xs font-medium">
              {t.groupTitle}
            </Label>
            <Input
              id="group-title"
              placeholder={t.groupTitlePlaceholder}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-9"
            />
          </div>

          {/* Members Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label className="text-xs font-medium">
                  {t.selectMembers(selectedIds.length)}
                </Label>
                <span className="text-[11px] text-muted-foreground">
                  (已选 {selectedIds.length}/{agents.length})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="text-xs text-primary hover:underline font-medium inline-flex items-center gap-1"
                >
                  <CheckSquare className="h-3 w-3" />
                  全选
                </button>
                <span className="text-muted-foreground/50 text-xs">|</span>
                <button
                  type="button"
                  onClick={handleDeselectAll}
                  className="text-xs text-muted-foreground hover:text-foreground hover:underline inline-flex items-center gap-1"
                >
                  <Square className="h-3 w-3" />
                  清空
                </button>
              </div>
            </div>

            {/* Agent Grid: 2 columns on sm+ */}
            <div className="max-h-56 overflow-y-auto rounded-lg border bg-muted/20 p-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {agents.map((agent) => {
                  const isSelected = selectedIds.includes(agent.id);
                  const isPrimary = agent.id === primaryAgentId;

                  return (
                    <div
                      key={agent.id}
                      onClick={() => toggleAgent(agent.id)}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        if (!isSelected) {
                          toggleAgent(agent.id);
                        }
                        setPrimaryAgentId(agent.id);
                      }}
                      className={cn(
                        'group flex items-center justify-between gap-2.5 rounded-lg border p-2 text-left cursor-pointer transition-all select-none',
                        isSelected
                          ? isPrimary
                            ? 'border-primary/60 bg-primary/10 shadow-xs'
                            : 'border-border bg-card hover:border-border/80 shadow-xs'
                          : 'border-transparent bg-transparent opacity-50 hover:opacity-80 hover:bg-muted/40'
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium text-white shadow-xs"
                          style={{ backgroundColor: agent.colour }}
                        >
                          {agent.avatar}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-xs font-semibold">{agent.name}</span>
                            {isPrimary && (
                              <Badge
                                variant="default"
                                className="text-[9px] px-1 py-0 h-3.5 leading-none shrink-0"
                              >
                                {t.primaryAgent}
                              </Badge>
                            )}
                          </div>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {agent.role}
                          </p>
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center">
                        <span
                          className={cn(
                            'flex h-4 w-4 items-center justify-center rounded border transition-colors',
                            isSelected
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-muted-foreground/30 bg-background group-hover:border-muted-foreground/60'
                          )}
                        >
                          {isSelected && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground px-0.5">
              <span>{t.clickToSelect}</span>
              {needsPrimary && primaryAgent && (
                <span className="font-medium text-foreground">
                  当前主答：<span className="text-primary">{primaryAgent.name}</span>
                </span>
              )}
            </div>
          </div>

          {/* Discussion Mode Selection */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">{t.discussionMode}</Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* Council Mode */}
              <button
                type="button"
                onClick={() => setMode('council')}
                className={cn(
                  'rounded-lg border p-3 text-left transition-all flex flex-col justify-between gap-1.5',
                  mode === 'council'
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/20 shadow-xs'
                    : 'border-border/70 bg-card hover:bg-muted/40'
                )}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs font-semibold flex items-center gap-1.5">
                    <MessageSquare className="h-3.5 w-3.5 text-primary" />
                    {t.councilMode}
                  </span>
                  {mode === 'council' && (
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  {t.councilModeDesc}
                </p>
              </button>

              {/* Round Robin Mode */}
              <button
                type="button"
                onClick={() => setMode('round-robin')}
                className={cn(
                  'rounded-lg border p-3 text-left transition-all flex flex-col justify-between gap-1.5',
                  mode === 'round-robin'
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/20 shadow-xs'
                    : 'border-border/70 bg-card hover:bg-muted/40'
                )}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs font-semibold flex items-center gap-1.5">
                    <RefreshCw className="h-3.5 w-3.5 text-primary" />
                    {t.roundRobinMode}
                  </span>
                  {mode === 'round-robin' && (
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  {t.roundRobinModeDesc}
                </p>
              </button>

              {/* Free Chat Mode */}
              <button
                type="button"
                onClick={() => setMode('free-chat')}
                className={cn(
                  'rounded-lg border p-3 text-left transition-all flex flex-col justify-between gap-1.5',
                  mode === 'free-chat'
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/20 shadow-xs'
                    : 'border-border/70 bg-card hover:bg-muted/40'
                )}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs font-semibold flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    {t.freeChatMode}
                  </span>
                  {mode === 'free-chat' && (
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  {t.freeChatModeDesc}
                </p>
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <Button
            onClick={handleCreate}
            disabled={!canCreate}
            className="w-full h-10 font-medium text-sm mt-2"
          >
            {creating ? t.creating : t.create}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
