"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type RichAgentMarkdownVariant = "bubble" | "canvas";

interface RichAgentMarkdownProps {
  markdown: string;
  variant?: RichAgentMarkdownVariant;
  className?: string;
}

export function RichAgentMarkdown({
  markdown,
  variant = "bubble",
  className,
}: RichAgentMarkdownProps) {
  const isBubble = variant === "bubble";

  return (
    <div
      className={cn(
        "min-w-0 text-[#111111]",
        isBubble ? "text-[13.5px] leading-[1.55]" : "text-[13px] leading-[1.65] text-[#222222]",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="mb-3 text-[22px] font-semibold tracking-[-0.03em] text-[#0A0A0A]">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-2.5 text-[19px] font-semibold tracking-[-0.025em] text-[#0A0A0A]">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-2 text-[16px] font-semibold tracking-[-0.02em] text-[#111111]">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="mb-2 text-[14px] font-semibold text-[#111111]">{children}</h4>
          ),
          p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
          ul: ({ children }) => (
            <ul className="mb-3 ml-5 list-disc space-y-1.5 marker:text-[#999999] last:mb-0">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-3 ml-5 list-decimal space-y-1.5 marker:text-[#999999] last:mb-0">
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="pl-0.5">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold text-[#0A0A0A]">{children}</strong>,
          em: ({ children }) => <em className="italic text-[#333333]">{children}</em>,
          pre: ({ children }) => (
            <pre className="mb-3 overflow-x-auto rounded-[8px] border border-[#E0E0E0] bg-[#FFFFFF] p-3 font-mono text-[12px] leading-[1.55] text-[#333333] last:mb-0">
              {children}
            </pre>
          ),
          code: ({ children, className: codeClassName }) => {
            const rendered = String(children).replace(/\n$/, "");
            const isBlockCode = Boolean(codeClassName);

            if (isBlockCode) {
              return (
                <code className={cn("font-mono text-[12px] text-[#333333]", codeClassName)}>
                  {rendered}
                </code>
              );
            }

            return (
              <code className="rounded-[4px] border border-[#E0E0E0] bg-[#FFFFFF] px-1 py-0.5 font-mono text-[12px] text-[#333333]">
                {rendered}
              </code>
            );
          },
          table: ({ children }) => (
            <div className="my-3 overflow-hidden rounded-[8px] border border-[#E0E0E0] bg-[#FFFFFF] last:mb-0">
              <Table className="text-[12.5px]">{children}</Table>
            </div>
          ),
          thead: ({ children }) => <TableHeader className="bg-[#FAFAFA]">{children}</TableHeader>,
          tbody: ({ children }) => <TableBody>{children}</TableBody>,
          tr: ({ children }) => (
            <TableRow className="border-[#F4F4F4] hover:bg-[#FAFAFA]">{children}</TableRow>
          ),
          th: ({ children }) => (
            <TableHead className="h-9 whitespace-nowrap border-[#EBEBEB] px-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#999999]">
              {children}
            </TableHead>
          ),
          td: ({ children }) => (
            <TableCell className="px-3 py-2.5 text-[12.5px] text-[#333333]">{children}</TableCell>
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
