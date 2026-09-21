'use client';

import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import 'katex/dist/katex.min.css';

interface MarkdownRendererProps {
  content: string;
}

// Memoized: during streaming the message list re-renders on every token,
// but past messages' content never changes — skip re-parsing their markdown.
export const MarkdownRenderer = memo(function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="prose prose-sm dark:prose-invert min-w-0 max-w-none break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeHighlight]}
        components={{
          pre({ children, ...props }) {
            return (
              <pre className="relative max-w-full overflow-x-auto rounded-lg bg-muted p-4" {...props}>
                {children}
              </pre>
            );
          },
          code({ children, className, ...props }) {
            const isInline = !className;
            if (isInline) {
              return (
                <code className="rounded bg-muted px-1.5 py-0.5 text-sm font-mono" {...props}>
                  {children}
                </code>
              );
            }
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          a({ href, children, ...props }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-4 hover:text-primary/80"
                {...props}
              >
                {children}
              </a>
            );
          },
          table({ children, ...props }) {
            return (
              <div className="my-4 max-w-full overflow-x-auto rounded-lg border border-border bg-background">
                <table className="w-full min-w-[520px] border-collapse text-sm" {...props}>
                  {children}
                </table>
              </div>
            );
          },
          thead({ children, ...props }) {
            return (
              <thead className="border-b border-border bg-muted/60" {...props}>
                {children}
              </thead>
            );
          },
          tr({ children, ...props }) {
            return (
              <tr className="border-b border-border last:border-b-0" {...props}>
                {children}
              </tr>
            );
          },
          th({ children, ...props }) {
            return (
              <th className="px-3 py-2 text-left align-top font-semibold text-foreground" {...props}>
                {children}
              </th>
            );
          },
          td({ children, ...props }) {
            return (
              <td className="px-3 py-2 align-top text-foreground/90" {...props}>
                {children}
              </td>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
