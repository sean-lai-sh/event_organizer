"use client";

import { Wrench } from "lucide-react";
import type { AgentMessage, ContentBlock } from "./types";
import { RichAgentMarkdown } from "./RichAgentMarkdown";
import { stabilizeMarkdownPreview } from "./streamingMarkdown";

interface MessageBubbleProps {
  message: AgentMessage;
  streamingText?: string;
}

export function MessageBubble({ message, streamingText }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const isTool = message.role === "tool";
  const isStreaming = !!streamingText || !!message.isStreaming;

  if (isTool) {
    return <ToolResultRow message={message} />;
  }

  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {/* No AI avatar — assistant messages render as plain text (Claude/GPT style) */}

      <div
        className={
          isUser
            ? "flex max-w-[78%] flex-col gap-1 items-end"
            : "flex flex-1 flex-col gap-1 items-start"
        }
      >
        {message.content.map((block, i) => (
          <ContentBlockView
            key={i}
            block={block}
            isUser={isUser}
            streamingText={i === message.content.length - 1 ? streamingText : undefined}
            isMessageStreaming={i === message.content.length - 1 ? message.isStreaming : undefined}
          />
        ))}

        {isStreaming && message.content.length === 0 && (
          <span className="text-[13.5px] leading-[1.65] text-[#111111]">
            <StreamingCursor />
          </span>
        )}
      </div>

      {isUser && (
        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#E0E0E0] bg-[#FFFFFF]">
          <span className="text-[10px] font-semibold text-[#555555]">U</span>
        </div>
      )}
    </div>
  );
}

function ContentBlockView({
  block,
  isUser,
  streamingText,
  isMessageStreaming,
}: {
  block: ContentBlock;
  isUser: boolean;
  streamingText?: string;
  isMessageStreaming?: boolean;
}) {
  if (block.type === "text") {
    const fullText = streamingText ?? block.text;
    const isStreaming = !!streamingText || !!isMessageStreaming;

    if (isUser) {
      return (
        <div className="rounded-[12px] rounded-br-[4px] bg-[#0A0A0A] px-3.5 py-2.5 text-[13.5px] leading-[1.55] text-white">
          {fullText}
          {isStreaming && <StreamingCursor />}
        </div>
      );
    }

    return <AssistantTextBlock text={fullText} isStreaming={isStreaming} />;
  }

  if (block.type === "tool_use") {
    return (
      <div className="flex items-center gap-2 rounded-[8px] border border-[#EBEBEB] bg-[#FAFAFA] px-2.5 py-1.5">
        <Wrench className="h-3 w-3 text-[#BBBBBB]" strokeWidth={1.8} />
        <span className="font-mono text-[11px] text-[#555555]">{block.name}</span>
        {block.input && (
          <span className="text-[11px] text-[#BBBBBB]">
            {JSON.stringify(block.input).slice(0, 48)}
            {JSON.stringify(block.input).length > 48 ? "…" : ""}
          </span>
        )}
      </div>
    );
  }

  return null;
}

function AssistantTextBlock({
  text,
  isStreaming,
}: {
  text: string;
  isStreaming: boolean;
}) {
  if (!isStreaming) {
    return (
      <div className="text-[13.5px] leading-[1.65] text-[#111111]">
        <RichAgentMarkdown markdown={text} variant="bubble" />
      </div>
    );
  }

  const { stableMarkdown, unstableTail } = stabilizeMarkdownPreview(text);

  return (
    <div className="text-[13.5px] leading-[1.65] text-[#111111]">
      {stableMarkdown ? (
        <RichAgentMarkdown markdown={stableMarkdown} variant="bubble" />
      ) : null}
      {unstableTail ? (
        <span className="whitespace-pre-wrap">
          {unstableTail}
          <StreamingCursor />
        </span>
      ) : (
        <StreamingCursor />
      )}
    </div>
  );
}

function ToolResultRow({ message }: { message: AgentMessage }) {
  const block = message.content[0];
  if (!block || block.type !== "tool_result") return null;

  return (
    <div className="flex items-start gap-2 pl-2">
      <div className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#CFCFCF]" />
      <p className="text-[11.5px] text-[#999999]">{block.content}</p>
    </div>
  );
}

function StreamingCursor() {
  return (
    <>
      {" "}
      <span
        className="inline-block h-[13px] w-[2px] translate-y-[1px] rounded-full bg-current opacity-60"
        style={{ animation: "cursorBlink 900ms ease-in-out infinite" }}
      />
      <style>{`
        @keyframes cursorBlink {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 0; }
        }
      `}</style>
    </>
  );
}
