'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { AgentConfig } from '@/lib/types/agents';
import type { ConversationMode } from '@/lib/types/council';
import type { Scene } from '@/lib/types/scene';
import {
  CircleHelp,
  Users,
  Check,
  Crown,
  CheckSquare,
  Square,
  Sparkles,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n';

interface ChatSettingsProps {
  title?: string;
  agents: AgentConfig[];
  activeSceneName?: string;
  activeSceneEmoji?: string;
  primaryAgentId: string | null;
  selectedAgentIds: string[];
  mode: ConversationMode;
  onModeChange: (mode: ConversationMode) => void;
  onPrimaryAgentChange: (agentId: string) => void;
  onSelectedAgentIdsChange: (ids: string[]) => void;
}

export function ChatSettings({
  title,
  agents,
  activeSceneName,
  activeSceneEmoji,
  primaryAgentId,
  selectedAgentIds,
  mode,
  onModeChange,
  onPrimaryAgentChange,
  onSelectedAgentIdsChange,
}: ChatSettingsProps) {
  const { t, locale } = useI18n();
  const [sheetOpen, setSheetOpen] = useState(false);

  const toggleAgent = (agentId: string) => {
    if (selectedAgentIds.includes(agentId)) {
      if (agentId === primaryAgentId) {
        // Transfer primary to next active agent if available
        const remaining = selectedAgentIds.filter((id) => id !== agentId);
        if (remaining.length > 0) {
          onPrimaryAgentChange(remaining[0]);
        }
      }
      onSelectedAgentIdsChange(selectedAgentIds.filter((id) => id !== agentId));
    } else {
      onSelectedAgentIdsChange([...selectedAgentIds, agentId]);
      if (!primaryAgentId) {
        onPrimaryAgentChange(agentId);
      }
    }
  };

  const handleSetPrimary = (agentId: string) => {
    onPrimaryAgentChange(agentId);
    if (!selectedAgentIds.includes(agentId)) {
      onSelectedAgentIdsChange([...selectedAgentIds, agentId]);
    }
  };

  const handleSelectAll = () => {
    const allIds = agents.map((a) => a.id);
    onSelectedAgentIdsChange(allIds);
    if (!primaryAgentId && allIds.length > 0) {
      onPrimaryAgentChange(allIds[0]);
    }
  };

  const handleDeselectAll = () => {
    onSelectedAgentIdsChange([]);
  };

  if (agents.length === 0) return null;

  const activeAgents = agents.filter((a) => selectedAgentIds.includes(a.id));
  const visibleAvatarAgents = activeAgents.slice(0, 4);
  const extraCount = Math.max(0, activeAgents.length - 4);
  const currentSceneDisplay = activeSceneName || title || (locale === 'zh' ? '综合讨论室' : 'General Discussion');
  const currentSceneEmoji = activeSceneEmoji || '💬';

  const MODES: { value: ConversationMode; label: string; icon: string; desc: string }[] = [
    {
      value: 'council',
      label: t.council,
      icon: '⚖️',
      desc: t.councilModeHelp,
    },
    {
      value: 'round-robin',
      label: t.roundRobin,
      icon: '🔄',
      desc: t.roundRobinHelp,
    },
    {
      value: 'free-chat',
      label: t.freeChat,
      icon: '💬',
      desc: t.freeChatHelp,
    },
  ];

  return (
    <TooltipProvider>
      <div className="relative flex h-13 min-h-[52px] shrink-0 items-center justify-between border-b bg-muted/20 px-3 sm:px-4 gap-2 z-10 select-none">
        {/* Left: current group title */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base leading-none">{currentSceneEmoji}</span>
          <span className="text-xs font-bold text-foreground truncate leading-tight max-w-[200px] sm:max-w-[280px]">
            {currentSceneDisplay}
          </span>
        </div>

        {/* Center: Discussion Mode as the Scene's communication rule */}
        <div className="flex items-center rounded-lg bg-muted/80 p-0.5 border border-border/50 text-xs shrink-0 shadow-2xs">
          {MODES.map((m) => {
            const isSelected = mode === m.value;
            return (
              <Tooltip key={m.value}>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      onClick={() => onModeChange(m.value)}
                      className={cn(
                        'flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-all text-xs cursor-pointer',
                        isSelected
                          ? 'bg-background text-foreground shadow-2xs font-semibold ring-1 ring-border/50'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    />
                  }
                >
                  <span className="text-xs">{m.icon}</span>
                  <span className="hidden md:inline">{m.label}</span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs text-xs">
                  {m.desc}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        {/* Right: Avatar Stack (Members Sheet Trigger) & Help */}
        <div className="flex items-center gap-2 shrink-0">
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger
              render={
                <button
                  type="button"
                  className="group flex items-center gap-2 rounded-lg border border-border/70 bg-background px-2 py-1 shadow-2xs hover:border-primary/40 hover:bg-muted/50 transition-all cursor-pointer"
                  title={t.manageMembers}
                />
              }
            >
              {/* Stack of first few avatars */}
              <div className="flex items-center -space-x-1.5 overflow-hidden py-0.5">
                {visibleAvatarAgents.map((agent) => (
                  <span
                    key={agent.id}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-medium text-white ring-2 ring-background shrink-0"
                    style={{ backgroundColor: agent.colour }}
                    title={agent.name}
                  >
                    {agent.avatar}
                  </span>
                ))}
                {extraCount > 0 && (
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground ring-2 ring-background shrink-0">
                    +{extraCount}
                  </span>
                )}
              </div>

              {/* Members Count Badge */}
              <span className="text-xs font-medium text-foreground group-hover:text-primary transition-colors flex items-center gap-1">
                <Users className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                <span>{selectedAgentIds.length}</span>
              </span>
            </SheetTrigger>

            {/* Member Drawer (Sheet) */}
            <SheetContent side="right" className="sm:max-w-md w-full p-0 flex flex-col h-full">
              <SheetHeader className="p-4 border-b pb-3 gap-1">
                <div className="flex items-center justify-between">
                  <SheetTitle className="text-base font-semibold flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    {t.groupMembers} ({agents.length})
                  </SheetTitle>
                  <div className="flex items-center gap-2 pr-6">
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
                <SheetDescription className="text-xs text-muted-foreground">
                  {t.clickToSelect}
                </SheetDescription>
              </SheetHeader>

              {/* Scrollable Agent List in Drawer */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {agents.map((agent) => {
                  const isSelected = selectedAgentIds.includes(agent.id);
                  const isPrimary = agent.id === primaryAgentId;

                  return (
                    <div
                      key={agent.id}
                      onClick={() => toggleAgent(agent.id)}
                      onDoubleClick={() => handleSetPrimary(agent.id)}
                      className={cn(
                        'group flex items-center justify-between gap-3 rounded-xl border p-2.5 transition-all cursor-pointer select-none',
                        isSelected
                          ? isPrimary
                            ? 'border-primary/60 bg-primary/10 shadow-xs'
                            : 'border-border bg-card hover:border-border/80 shadow-xs'
                          : 'border-transparent bg-muted/30 opacity-50 hover:opacity-80 hover:bg-muted/60'
                      )}
                    >
                      {/* Left: Avatar & Info */}
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <span
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white shadow-xs"
                          style={{ backgroundColor: agent.colour }}
                        >
                          {agent.avatar}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="truncate text-xs font-semibold text-foreground">
                              {agent.name}
                            </span>
                            {isPrimary && (
                              <Badge
                                variant="default"
                                className="text-[9px] px-1.5 py-0 h-4 leading-none gap-0.5"
                              >
                                <Crown className="h-2.5 w-2.5" />
                                {t.primaryAgent}
                              </Badge>
                            )}
                          </div>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {agent.role}
                          </p>
                          <span className="text-[10px] text-muted-foreground/70 font-mono">
                            {agent.modelId}
                          </span>
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isSelected && !isPrimary && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSetPrimary(agent.id);
                            }}
                            className="text-[10px] text-muted-foreground hover:text-primary px-1.5 py-0.5 rounded border border-transparent hover:border-border transition-colors opacity-0 group-hover:opacity-100"
                            title={t.setAsPrimary}
                          >
                            {t.setAsPrimary}
                          </button>
                        )}
                        <div
                          className={cn(
                            'flex h-5 w-5 items-center justify-center rounded border transition-colors',
                            isSelected
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-muted-foreground/30'
                          )}
                        >
                          {isSelected && <Check className="h-3 w-3" />}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </SheetContent>
          </Sheet>

          {/* Help Dialog */}
          <Dialog>
            <DialogTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
                  title={t.help}
                />
              }
            >
              <CircleHelp className="h-4 w-4 text-muted-foreground" />
            </DialogTrigger>
            <DialogContent className="max-w-xl sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>{t.howCouncilWorks}</DialogTitle>
                <DialogDescription>{t.howCouncilWorksDesc}</DialogDescription>
              </DialogHeader>

              <div className="space-y-3 text-sm pt-2">
                <div className="space-y-1">
                  <h4 className="font-medium flex items-center gap-1.5">
                    <span>⚖️</span> {t.council}
                  </h4>
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    {t.councilModeHelp}
                  </p>
                </div>

                <div className="space-y-1">
                  <h4 className="font-medium flex items-center gap-1.5">
                    <span>🔄</span> {t.roundRobin}
                  </h4>
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    {t.roundRobinHelp}
                  </p>
                </div>

                <div className="space-y-1">
                  <h4 className="font-medium flex items-center gap-1.5">
                    <span>💬</span> {t.freeChat}
                  </h4>
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    {t.freeChatHelp}
                  </p>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </TooltipProvider>
  );
}
