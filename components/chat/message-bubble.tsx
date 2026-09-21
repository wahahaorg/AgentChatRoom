'use client';

import { memo } from 'react';
import { MarkdownRenderer } from './markdown-renderer';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { ExternalLink, File, FileText, Image as ImageIcon } from 'lucide-react';

export interface ChatFileAttachment {
  filename?: string;
  mediaType: string;
  url: string;
}

interface MessageBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  files?: ChatFileAttachment[];
  responseKind?: 'primary' | 'assistant';
  agentName?: string;
  agentModel?: string;
  agentAvatar?: string;
  agentColour?: string;
  isStreaming?: boolean;
}

// Memoized: past messages never change during streaming — skip re-rendering
// them on every streamed token.
export const MessageBubble = memo(function MessageBubble({
  role,
  content,
  files = [],
  responseKind = 'assistant',
  agentName,
  agentModel,
  agentAvatar,
  agentColour,
  isStreaming,
}: MessageBubbleProps) {
  const isUser = role === 'user';
  const { t } = useI18n();

  return (
    <div className={cn('flex min-w-0 gap-3 py-4', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarFallback
            className="text-sm"
            style={agentColour ? { backgroundColor: agentColour, color: 'white' } : undefined}
          >
            {agentAvatar || 'AI'}
          </AvatarFallback>
        </Avatar>
      )}
      <div className={cn('min-w-0 space-y-1', isUser ? 'max-w-[78%] items-end' : 'max-w-[92%] items-start')}>
        {!isUser && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium">{agentName ?? t.primaryResponse}</span>
            {responseKind === 'primary' && (
              <span
                className="rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                style={agentColour ? { borderColor: agentColour, color: agentColour } : undefined}
              >
                {t.primary}
              </span>
            )}
            {agentModel && <span className="text-[11px]">{agentModel}</span>}
          </div>
        )}
        <div
          className={cn(
            'min-w-0 px-4 py-2.5 shadow-sm',
            isUser
              ? 'rounded-[1.6rem] bg-primary/90 text-primary-foreground ring-1 ring-primary/20'
              : 'rounded-2xl border border-border/60 border-l-4 bg-muted',
          )}
          style={!isUser && agentColour ? { borderLeftColor: agentColour } : undefined}
        >
          {content.trim() && isUser ? (
            <p className="break-words text-sm whitespace-pre-wrap">{content}</p>
          ) : null}
          {content.trim() && !isUser ? (
            <MarkdownRenderer content={content} />
          ) : null}
          {files.length > 0 && (
            <AttachmentList files={files} isUser={isUser} hasContent={content.trim().length > 0} />
          )}
          {isStreaming && (
            <span className="inline-block w-2 h-4 bg-current animate-pulse ml-0.5" />
          )}
        </div>
      </div>
      {isUser && (
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarFallback className="text-sm bg-primary text-primary-foreground">
            {t.you}
          </AvatarFallback>
        </Avatar>
      )}
    </div>
  );
});

function AttachmentList({
  files,
  isUser,
  hasContent,
}: {
  files: ChatFileAttachment[];
  isUser: boolean;
  hasContent: boolean;
}) {
  return (
    <div className={cn('flex flex-col gap-2', hasContent && 'mt-3')}>
      {files.map((file, index) => (
        <AttachmentItem
          key={`${file.filename ?? file.mediaType}-${index}`}
          file={file}
          isUser={isUser}
        />
      ))}
    </div>
  );
}

function AttachmentItem({
  file,
  isUser,
}: {
  file: ChatFileAttachment;
  isUser: boolean;
}) {
  const { t } = useI18n();
  const isImage = file.mediaType.startsWith('image/');
  const isPdf = file.mediaType === 'application/pdf' || file.filename?.toLowerCase().endsWith('.pdf');
  const Icon = isImage ? ImageIcon : isPdf ? FileText : File;
  const label = file.filename ?? file.mediaType ?? t.attachedFile;
  const meta = file.mediaType || getExtension(label).toUpperCase() || t.attachedFile;

  return (
    <button
      type="button"
      onClick={() => openAttachment(file)}
      title={`${t.openFile} ${label}`}
      className={cn(
        'group flex w-full min-w-0 items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-colors',
        isUser
          ? 'border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/15'
          : 'border-border bg-background/70 hover:bg-background',
      )}
    >
      {isImage ? (
        <span
          className={cn(
            'h-9 w-9 shrink-0 overflow-hidden rounded-md border bg-muted',
            isUser && 'border-primary-foreground/20 bg-primary-foreground/10',
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={file.url} alt="" className="h-full w-full object-cover" />
        </span>
      ) : (
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-muted',
            isUser && 'border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground',
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{label}</span>
        <span className={cn('block truncate text-[11px]', isUser ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
          {meta}
        </span>
      </span>
      <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-60 transition-opacity group-hover:opacity-100" />
    </button>
  );
}

function getExtension(filename: string): string {
  const extension = filename.split('.').pop();
  return extension && extension !== filename ? extension : '';
}

function openAttachment(file: ChatFileAttachment) {
  const objectUrl = file.url.startsWith('data:')
    ? createObjectUrl(file.url, file.mediaType)
    : undefined;
  const openUrl = objectUrl ?? file.url;
  const openedWindow = window.open(openUrl, '_blank');

  if (!openedWindow) {
    downloadAttachment(openUrl, file.filename ?? 'attachment');
  } else {
    openedWindow.opener = null;
  }

  if (objectUrl) {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  }
}

function createObjectUrl(dataUrl: string, fallbackMediaType: string) {
  const commaIndex = dataUrl.indexOf(',');
  const header = commaIndex >= 0 ? dataUrl.slice(0, commaIndex) : `data:${fallbackMediaType}`;
  const body = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
  const mediaType = header.match(/^data:([^;,]+)/)?.[1] || fallbackMediaType || 'application/octet-stream';
  const isBase64 = header.includes(';base64');
  const binary = isBase64 ? atob(body) : decodeURIComponent(body);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return URL.createObjectURL(new Blob([bytes], { type: mediaType }));
}

function downloadAttachment(url: string, filename: string) {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
