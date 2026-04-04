"use client";

import { Wrench } from "lucide-react";
import type { AgentMessage, ContentBlock } from "./types";
import { RichAgentMarkdown } from "./RichAgentMarkdown";

interface MessageBubbleProps {
  message: AgentMessage;
  streamingText?: string;
}

export function MessageBubble({ message, streamingText }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const isTool = message.role === "tool";
  const isStreaming = !!streamingText;

  if (isTool) {
    return <ToolResultRow message={message} />;
  }

  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0A0A0A]">
          <span className="text-[9px] font-bold text-white">AI</span>
        </div>
      )}

      <div className={`flex max-w-[78%] flex-col gap-1 ${isUser ? "items-end" : "items-start"}`}>
        {message.content.map((block, i) => (
          <ContentBlockView
            key={i}
            block={block}
            isUser={isUser}
            streamingText={i === message.content.length - 1 ? streamingText : undefined}
          />
        ))}

        {isStreaming && message.content.length === 0 && (
          <div className="rounded-[12px] rounded-tl-[4px] bg-[#F4F4F4] px-3.5 py-2.5">
            <StreamingCursor />
          </div>
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
}: {
  block: ContentBlock;
  isUser: boolean;
  streamingText?: string;
}) {
  if (block.type === "text") {
    const text = streamingText ?? block.text;
    const isStreaming = !!streamingText;
    return (
      <div
        className={`rounded-[12px] px-3.5 py-2.5 text-[13.5px] leading-[1.55] ${
          isUser
            ? "rounded-br-[4px] bg-[#0A0A0A] text-white"
            : "rounded-tl-[4px] bg-[#F4F4F4] text-[#111111]"
        }`}
      >
        {isUser || isStreaming ? (
          text
        ) : (
          <RichAgentMarkdown markdown={text} variant="bubble" />
        )}
        {isStreaming && <StreamingCursor />}
      </div>
    );
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

function ToolResultRow({ message }: { message: AgentMessage }) {
  const block = message.content[0];
  if (!block || block.type !== "tool_result") return null;

  return (
    <div className="flex items-start gap-2 pl-9">
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
