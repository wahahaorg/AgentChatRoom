'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { Pencil, Plus, Settings, Trash2, X, PanelLeftClose, PanelLeftOpen, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ThemeToggle } from '@/components/theme-toggle';
import { LocaleToggle } from '@/components/locale-toggle';
import { CreateGroupDialog } from '@/components/chat/create-group-dialog';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import type { ConversationSummary } from '@/lib/types/council';
import type { AgentConfig } from '@/lib/types/agents';
import type { Scene } from '@/lib/types/scene';
import type { ConversationMode } from '@/lib/types/council';

interface SidebarProps {
  activeConversationId?: string;
  defaultMode?: ConversationMode;
}

export function Sidebar({ activeConversationId, defaultMode }: SidebarProps) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [editingConversationId, setEditingConversationId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [savingRenameId, setSavingRenameId] = useState<string | null>(null);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/conversations');
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
      }
    } catch {
      // Ignore fetch errors
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations, pathname]);

  useEffect(() => {
    fetch('/api/config')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        setAgents(data?.agents ?? []);
        setScenes(data?.scenes ?? []);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem('council.sidebar.collapsed');
    if (saved) {
      setIsCollapsed(saved === 'true');
    }
  }, []);


  const handleToggleCollapsed = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem('council.sidebar.collapsed', String(next));
      return next;
    });
  };

  const handleDeleteConversation = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const res = await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setConversations((prev) => prev.filter((c) => c.id !== id));
        if (activeConversationId === id) {
          router.push('/chat');
        }
      }
    } catch {
      // Ignore
    }
  };

  const handleStartRename = (
    e: React.MouseEvent<HTMLButtonElement>,
    id: string,
    currentTitle: string,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingConversationId(id);
    setEditingTitle(currentTitle);
  };

  const handleCancelRename = () => {
    setEditingConversationId(null);
    setEditingTitle('');
  };

  const handleSaveRename = async (id: string) => {
    const nextTitle = editingTitle.trim();
    const original = conversations.find((conv) => conv.id === id)?.title ?? '';

    if (!nextTitle || nextTitle === original) {
      handleCancelRename();
      return;
    }

    setSavingRenameId(id);

    try {
      const res = await fetch(`/api/conversations/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: nextTitle }),
      });

      if (res.ok) {
        const updated = await res.json();
        setConversations((prev) =>
          prev
            .map((conv) =>
              conv.id === id
                ? {
                    ...conv,
                    title: updated.title,
                    updatedAt: updated.updatedAt,
                  }
                : conv,
            )
            .sort(
              (a, b) =>
                new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
            ),
        );
      }
    } catch {
      // Ignore
    } finally {
      setSavingRenameId(null);
      handleCancelRename();
    }
  };

  // Group conversations by date
  const grouped = groupConversations(conversations, t);

  return (
    <div
      className={cn(
        'flex h-full shrink-0 flex-col border-r bg-muted/30 transition-[width] duration-200',
        isCollapsed ? 'w-16' : 'w-64',
      )}
    >
      <div className={cn('px-3 pt-3', isCollapsed ? 'pb-2' : 'pb-2')}>
        {isCollapsed ? (
          <Link
            href="/chat"
            className="mx-auto flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-xs transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            title={t.appBrand}
          >
            <Sparkles className="h-4 w-4" />
          </Link>
        ) : (
          <Link
            href="/chat"
            className="group flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/90 to-primary text-primary-foreground shadow-xs shadow-primary/20 transition-transform group-hover:scale-105">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold tracking-tight text-foreground">
                  {t.appBrand}
                </span>
                <span className="rounded bg-primary/10 px-1 py-0.2 text-[9px] font-semibold text-primary">
                  研讨
                </span>
              </div>
              <p className="truncate text-[11px] text-muted-foreground">
                {t.appSlogan}
              </p>
            </div>
          </Link>
        )}
      </div>

      <div className="px-3 pb-3">
        <CreateGroupDialog
          agents={agents}
          scenes={scenes}
          defaultMode={defaultMode}
          collapsed={isCollapsed}
        />
      </div>

      <Separator />

      <ScrollArea className="flex-1">
        {isCollapsed ? (
          <div className="flex flex-col items-center gap-2 px-2 py-3">
            {loading ? (
              <p className="text-[10px] text-muted-foreground">...</p>
            ) : conversations.length === 0 ? (
              <p className="text-[10px] text-muted-foreground">0</p>
            ) : (
              conversations.slice(0, 10).map((conv) => (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => router.push(`/chat/${conv.id}`)}
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-md text-[11px] font-semibold transition-colors',
                    conv.id === activeConversationId
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                  title={conv.title}
                  aria-label={`Open ${conv.title}`}
                >
                  {(conv.title.trim().charAt(0) || '?').toUpperCase()}
                </button>
              ))
            )}
          </div>
        ) : (
          <div className="p-2">
            {loading ? (
              <p className="text-xs text-muted-foreground px-2 py-4">{t.loading}</p>
            ) : conversations.length === 0 ? (
              <p className="text-xs text-muted-foreground px-2 py-4">
                {t.noConversations}
              </p>
            ) : (
              Object.entries(grouped).map(([label, convs]) => (
                <div key={label} className="mb-3">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2 py-1">
                    {label}
                  </p>
                  {convs.map((conv) => (
                    <div
                      key={conv.id}
                      className={cn(
                        'group flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm transition-colors',
                        conv.id === activeConversationId
                          ? 'bg-primary/10 text-primary'
                          : 'hover:bg-muted text-foreground'
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => router.push(`/chat/${conv.id}`)}
                        className="min-w-0 flex-1 text-left"
                      >
                        {editingConversationId === conv.id ? (
                          <input
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            onBlur={(e) => {
                              const nextFocused = e.relatedTarget as HTMLElement | null;
                              if (nextFocused?.dataset.renameAction === 'cancel') {
                                handleCancelRename();
                                return;
                              }
                              void handleSaveRename(conv.id);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                e.currentTarget.blur();
                              }
                              if (e.key === 'Escape') {
                                e.preventDefault();
                                handleCancelRename();
                              }
                            }}
                            autoFocus
                            disabled={savingRenameId === conv.id}
                            className="h-7 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring/50"
                          />
                        ) : (
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium">{conv.title}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {t.messagesCount(conv.messageCount)} / {conv.mode}
                            </p>
                          </div>
                        )}
                      </button>

                      {editingConversationId === conv.id ? (
                        <button
                          type="button"
                          onClick={handleCancelRename}
                          data-rename-action="cancel"
                          className="text-muted-foreground hover:text-foreground transition-colors p-1"
                          title={t.cancelRename}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <div className="flex items-center opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={(e) => handleStartRename(e, conv.id, conv.title)}
                            className="text-muted-foreground hover:text-foreground transition-colors p-1"
                            title={t.renameConversation}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteConversation(e, conv.id)}
                            className="text-muted-foreground hover:text-destructive transition-colors p-1"
                            title={t.deleteConversation}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        )}
      </ScrollArea>

      <div className={cn('mt-auto p-4', isCollapsed ? 'space-y-1 px-2' : 'space-y-2')}>
        <Separator className="mb-2" />

        <div className={cn('flex items-center gap-1', isCollapsed ? 'justify-center' : 'justify-between')}>
          <ThemeToggle compact={isCollapsed} className={cn(!isCollapsed && 'flex-1')} />

          <LocaleToggle compact={isCollapsed} />

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleToggleCollapsed}
            aria-label={isCollapsed ? t.expandSidebar : t.collapseSidebar}
            title={isCollapsed ? t.expandSidebar : t.collapseSidebar}
          >
            {isCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>
        </div>

        <Link href="/settings" className={cn(isCollapsed && 'flex justify-center')}>
          <Button
            variant="outline"
            size={isCollapsed ? 'icon-sm' : 'sm'}
            className={cn(!isCollapsed && 'w-full')}
            aria-label={t.settings}
            title={t.settings}
          >
            {isCollapsed ? <Settings className="h-3.5 w-3.5" /> : t.settings}
          </Button>
        </Link>
      </div>
    </div>
  );
}

function groupConversations(
  conversations: ConversationSummary[],
  t: ReturnType<typeof useI18n>['t'],
): Record<string, ConversationSummary[]> {
  const groups: Record<string, ConversationSummary[]> = {};
  const now = new Date();

  for (const conv of conversations) {
    const date = new Date(conv.updatedAt);
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    let label: string;
    if (diffDays === 0) label = t.today;
    else if (diffDays === 1) label = t.yesterday;
    else if (diffDays < 7) label = t.thisWeek;
    else if (diffDays < 30) label = t.thisMonth;
    else label = t.older;

    if (!groups[label]) groups[label] = [];
    groups[label].push(conv);
  }

  return groups;
}
