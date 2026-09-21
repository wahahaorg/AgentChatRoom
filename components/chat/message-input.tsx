'use client';

import { useState, useRef, useCallback, type KeyboardEvent, type DragEvent } from 'react';
import { Paperclip, SendHorizontal, Square, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { MentionDropdown } from './mention-dropdown';
import type { AgentConfig } from '@/lib/types/agents';

interface MessageInputProps {
  onSend: (message: string, files?: FileList, mentionedAgentIds?: string[]) => void;
  onStop?: () => void;
  isStreaming?: boolean;
  statusText?: string;
  disabled?: boolean;
  placeholder?: string;
  agents?: AgentConfig[];
}

export function MessageInput({
  onSend,
  onStop,
  isStreaming,
  statusText,
  disabled,
  placeholder,
  agents = [],
}: MessageInputProps) {
  const { t } = useI18n();
  const [input, setInput] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionedAgents, setMentionedAgents] = useState<AgentConfig[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const mentionableAgents = mentionQuery === null
    ? []
    : agents.filter(
        (a) =>
          !mentionedAgents.some((m) => m.id === a.id) &&
          a.name.toLowerCase().includes(mentionQuery.toLowerCase()),
      );

  const detectMention = (value: string, caret: number) => {
    const beforeCaret = value.slice(0, caret);
    const match = beforeCaret.match(/@([^\s@]*)$/);
    setMentionQuery(match ? match[1] : null);
  };

  const selectMention = (agent: AgentConfig) => {
    const textarea = textareaRef.current;
    const caret = textarea?.selectionStart ?? input.length;
    const beforeCaret = input.slice(0, caret);
    const afterCaret = input.slice(caret);
    const nextInput = beforeCaret.replace(/@([^\s@]*)$/, `@${agent.name} `) + afterCaret;

    setInput(nextInput);
    setMentionedAgents((prev) =>
      prev.some((m) => m.id === agent.id) ? prev : [...prev, agent],
    );
    setMentionQuery(null);
    textareaRef.current?.focus();
  };

  const handleSend = useCallback(() => {
    if (isStreaming) return;

    const trimmed = input.trim();
    if (!trimmed && files.length === 0) return;

    const mentionedIds = mentionedAgents
      .filter((m) => trimmed.includes(`@${m.name}`))
      .map((m) => m.id);

    if (files.length > 0) {
      const dt = new DataTransfer();
      files.forEach((f) => dt.items.add(f));
      onSend(trimmed, dt.files, mentionedIds.length > 0 ? mentionedIds : undefined);
    } else {
      onSend(trimmed, undefined, mentionedIds.length > 0 ? mentionedIds : undefined);
    }

    setInput('');
    setFiles([]);
    setMentionedAgents([]);
    setMentionQuery(null);
  }, [input, files, isStreaming, onSend, mentionedAgents]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (isStreaming) return;

    if (mentionQuery !== null && e.key === 'Escape') {
      e.preventDefault();
      setMentionQuery(null);
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      setFiles((prev) => [...prev, ...Array.from(e.dataTransfer.files)]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
    }
    e.target.value = '';
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div
      className={cn(
        'relative rounded-xl border bg-background shadow-sm transition-colors',
        isDragOver && 'border-primary bg-primary/5',
        'focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10',
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {mentionableAgents.length > 0 && (
        <div className="absolute inset-x-0 bottom-full mb-2 px-3">
          <MentionDropdown
            agents={mentionableAgents}
            onSelect={selectMention}
            position={{ top: 0, left: 12 }}
          />
        </div>
      )}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3 pt-3">
          {files.map((file, i) => (
            <Badge
              key={`${file.name}-${i}`}
              variant="secondary"
              className="gap-1 pr-1"
            >
              <span className="max-w-[150px] truncate text-xs">{file.name}</span>
              <span className="text-xs text-muted-foreground">({formatFileSize(file.size)})</span>
              <button
                type="button"
                onClick={() => removeFile(i)}
                className="ml-1 rounded-full p-0.5 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                aria-label={t.removeFile}
                title={t.removeFile}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      {mentionedAgents.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-3 pt-2">
          {mentionedAgents.map((agent) => (
            <Badge key={agent.id} variant="outline" className="gap-1 pr-1 text-xs">
              <span
                className="flex h-4 w-4 items-center justify-center rounded-full text-[8px] text-white"
                style={{ backgroundColor: agent.colour }}
              >
                {agent.avatar}
              </span>
              @{agent.name}
              <button
                type="button"
                onClick={() =>
                  setMentionedAgents((prev) => prev.filter((m) => m.id !== agent.id))
                }
                className="ml-0.5 rounded-full p-0.5 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                aria-label={t.removeFile}
                title={t.removeFile}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 p-3">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileSelect}
          accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.heic,.heif,.txt,.md,.csv,.json,.py,.js,.ts,.tsx"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || isStreaming}
          aria-label={t.attachFiles}
          title={t.attachFiles}
        >
          <Paperclip className="h-4 w-4" />
        </Button>
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            detectMention(e.target.value, e.target.selectionStart ?? e.target.value.length);
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            // Delay so mouse clicks on dropdown items register first
            window.setTimeout(() => setMentionQuery(null), 150);
          }}
          placeholder={placeholder ?? t.typeMessage}
          disabled={disabled || isStreaming}
          className="min-h-[40px] max-h-[200px] resize-none border-0 px-0 py-2.5 leading-5 focus-visible:ring-0 focus-visible:ring-offset-0"
          rows={1}
        />
        {isStreaming ? (
          <Button
            type="button"
            size="icon"
            variant="destructive"
            className="h-10 w-10 shrink-0"
            onClick={onStop}
            aria-label={t.stopResponse}
            title={t.stopResponse}
          >
            <Square className="h-3.5 w-3.5 fill-current" />
          </Button>
        ) : (
          <Button
            type="button"
            size="icon"
            className="h-10 w-10 shrink-0"
            onClick={handleSend}
            disabled={disabled || (!input.trim() && files.length === 0)}
            aria-label={t.sendMessage}
            title={t.sendMessage}
          >
            <SendHorizontal className="h-4 w-4" />
          </Button>
        )}
      </div>
      {isStreaming && statusText && (
        <div className="px-3 pb-3">
          <p className="text-xs text-muted-foreground">{statusText}</p>
        </div>
      )}
      {isDragOver && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-primary/5">
          <p className="text-sm font-medium text-primary">{t.dropFilesHere}</p>
        </div>
      )}
    </div>
  );
}
