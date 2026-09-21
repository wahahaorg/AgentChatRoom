'use client';

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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { AgentConfig } from '@/lib/types/agents';
import type { ConversationMode } from '@/lib/types/council';
import { CircleHelp } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

interface ChatSettingsProps {
  agents: AgentConfig[];
  primaryAgentId: string | null;
  selectedAgentIds: string[];
  mode: ConversationMode;
  onModeChange: (mode: ConversationMode) => void;
  onPrimaryAgentChange: (agentId: string) => void;
  onSelectedAgentIdsChange: (ids: string[]) => void;
}

export function ChatSettings({
  agents,
  primaryAgentId,
  selectedAgentIds,
  mode,
  onModeChange,
  onPrimaryAgentChange,
  onSelectedAgentIdsChange,
}: ChatSettingsProps) {
  const { t } = useI18n();
  const toggleAgent = (agentId: string) => {
    if (selectedAgentIds.includes(agentId)) {
      // Don't allow deselecting the primary agent.
      if (agentId === primaryAgentId) return;
      onSelectedAgentIdsChange(selectedAgentIds.filter((id) => id !== agentId));
    } else {
      onSelectedAgentIdsChange([...selectedAgentIds, agentId]);
    }
  };

  const handlePrimaryChange = (agentId: string) => {
    onPrimaryAgentChange(agentId);
    if (!selectedAgentIds.includes(agentId)) {
      onSelectedAgentIdsChange([...selectedAgentIds, agentId]);
    }
  };

  if (agents.length === 0) return null;

  return (
    <TooltipProvider>
      <div className="relative flex shrink-0 justify-center border-b bg-muted/20 px-4 py-2.5">
        <div className="w-full max-w-3xl flex items-start justify-center gap-4">
          <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mr-1">
              {t.mode}
            </span>
            <Button
              size="sm"
              variant={mode === 'council' ? 'default' : 'ghost'}
              className="h-7 text-xs px-2.5"
              onClick={() => onModeChange('council')}
            >
              {t.council}
            </Button>
            <Button
              size="sm"
              variant={mode === 'round-robin' ? 'default' : 'ghost'}
              className="h-7 text-xs px-2.5"
              onClick={() => onModeChange('round-robin')}
            >
              {t.roundRobin}
            </Button>
          </div>

          <div className="h-5 w-px bg-border shrink-0 mt-1" />

          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mr-1 shrink-0 mt-0.5">
              {t.agentsLabel}
            </span>
            {agents.map((agent) => {
              const isSelected = selectedAgentIds.includes(agent.id);
              const isPrimary = agent.id === primaryAgentId;

              return (
                <Tooltip key={agent.id}>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        onClick={() => toggleAgent(agent.id)}
                        onDoubleClick={() => handlePrimaryChange(agent.id)}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs transition-colors border',
                          isSelected
                            ? isPrimary
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-muted border-border text-foreground'
                            : 'bg-transparent border-border/50 text-muted-foreground opacity-50',
                        )}
                      />
                    }
                  >
                    <span className="text-sm leading-none">{agent.avatar}</span>
                    <span className="font-medium">{agent.name}</span>
                    {isPrimary && (
                      <Badge variant="secondary" className="text-[8px] px-1 py-0 h-3.5 leading-none">
                        {t.first}
                      </Badge>
                    )}
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-72 items-start text-left">
                    <div className="space-y-1">
                      <p className="font-medium">
                        {agent.name}
                        {isPrimary ? ' (Primary)' : ''}
                        {!isSelected ? ` (${t.inactive})` : ''}
                      </p>
                      <p className="text-background/80">{t.modelLabel}: {agent.modelId}</p>
                      <p className="text-background/70">
                        {t.clickToggleHint}
                      </p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </div>

        <div className="hidden sm:flex flex-1 justify-end absolute right-4 top-2.5">
          <Dialog>
            <DialogTrigger
              render={<Button size="sm" variant="outline" className="h-7 px-2.5 shrink-0" />}
            >
              <CircleHelp className="size-3.5" />
              <span>{t.help}</span>
            </DialogTrigger>
            <DialogContent className="max-w-xl sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>{t.howCouncilWorks}</DialogTitle>
                <DialogDescription>
                  {t.howCouncilWorksDesc}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 text-sm">
                <div className="space-y-1">
                  <h4 className="font-medium">{t.council} Mode</h4>
                  <p className="text-muted-foreground">
                    {t.councilModeHelp}
                  </p>
                </div>

                <div className="space-y-1">
                  <h4 className="font-medium">{t.roundRobin} Mode</h4>
                  <p className="text-muted-foreground">
                    {t.roundRobinHelp}
                  </p>
                </div>

                <div className="space-y-1">
                  <h4 className="font-medium">{t.agentsLabel}</h4>
                  <p className="text-muted-foreground">
                    {t.agentControlsHelp}
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
