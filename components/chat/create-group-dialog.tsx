'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Users } from 'lucide-react';
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
      if (id === primaryAgentId) return;
      setSelectedIds(selectedIds.filter((sid) => sid !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const canCreate = selectedIds.length > 0 && primaryAgentId && !creating;

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
          primaryAgentId,
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
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t.createGroup}</DialogTitle>
          <DialogDescription>
            {t.createGroupDesc}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="group-title">{t.groupTitle}</Label>
            <Input
              id="group-title"
              placeholder={t.groupTitlePlaceholder}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t.selectMembers(selectedIds.length)}</Label>
            <div className="space-y-1.5 max-h-52 overflow-y-auto rounded-md border p-2">
              {agents.map((agent) => {
                const isSelected = selectedIds.includes(agent.id);
                const isPrimary = agent.id === primaryAgentId;
                return (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => toggleAgent(agent.id)}
                    onDoubleClick={() => setPrimaryAgentId(agent.id)}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                      isSelected ? 'bg-muted' : 'opacity-50 hover:opacity-80',
                    )}
                  >
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs text-white"
                      style={{ backgroundColor: agent.colour }}
                    >
                      {agent.avatar}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {agent.name}
                        {isPrimary && (
                          <span className="ml-1.5 text-[10px] text-primary font-semibold">{t.primaryAgent}</span>
                        )}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">{agent.role}</span>
                    </span>
                    <span
                      className={cn(
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                        isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
                      )}
                    >
                      {isSelected && (
                        <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M2.5 6.5L5 9l4.5-5.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">{t.clickToSelect}</p>
          </div>

          <div className="space-y-1.5">
            <Label>{t.discussionMode}</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode('council')}
                className={cn(
                  'rounded-md border p-2.5 text-left transition-colors',
                  mode === 'council' ? 'border-primary bg-primary/5' : 'hover:bg-muted',
                )}
              >
                <span className="block text-xs font-medium">{t.councilMode}</span>
                <span className="block text-[11px] text-muted-foreground mt-0.5">{t.councilModeDesc}</span>
              </button>
              <button
                type="button"
                onClick={() => setMode('round-robin')}
                className={cn(
                  'rounded-md border p-2.5 text-left transition-colors',
                  mode === 'round-robin' ? 'border-primary bg-primary/5' : 'hover:bg-muted',
                )}
              >
                <span className="block text-xs font-medium">{t.roundRobinMode}</span>
                <span className="block text-[11px] text-muted-foreground mt-0.5">{t.roundRobinModeDesc}</span>
              </button>
            </div>
          </div>

          <Button onClick={handleCreate} disabled={!canCreate} className="w-full">
            {creating ? t.creating : t.create}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
