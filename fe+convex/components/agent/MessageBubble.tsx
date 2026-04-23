"use client";

import { useState } from "react";
import { Wrench } from "lucide-react";
import type { AgentMessage, ContentBlock } from "./types";
import { RichAgentMarkdown } from "./RichAgentMarkdown";
import {
  getInitialFormValues,
  serializeChoiceRequestSubmission,
  serializeFormRequestSubmission,
} from "./questionCards";

interface MessageBubbleProps {
  message: AgentMessage;
  streamingText?: string;
  onStructuredSubmit?: (text: string) => void | Promise<void>;
}

export function MessageBubble({ message, streamingText, onStructuredSubmit }: MessageBubbleProps) {
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
            onStructuredSubmit={onStructuredSubmit}
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
  onStructuredSubmit,
}: {
  block: ContentBlock;
  isUser: boolean;
  streamingText?: string;
  onStructuredSubmit?: (text: string) => void | Promise<void>;
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

  if (block.type === "form_request") {
    return <FormRequestCard block={block} onStructuredSubmit={onStructuredSubmit} />;
  }

  if (block.type === "choice_request") {
    return <ChoiceRequestCard block={block} onStructuredSubmit={onStructuredSubmit} />;
  }

  return null;
}

function FormRequestCard({
  block,
  onStructuredSubmit,
}: {
  block: Extract<ContentBlock, { type: "form_request" }>;
  onStructuredSubmit?: (text: string) => void | Promise<void>;
}) {
  const [values, setValues] = useState<Record<string, string | boolean>>(() =>
    getInitialFormValues(block.payload.fields)
  );

  return (
    <form
      className="w-full max-w-[520px] rounded-[10px] border border-[#E0E0E0] bg-[#FFFFFF] p-3.5"
      onSubmit={(event) => {
        event.preventDefault();
        void onStructuredSubmit?.(serializeFormRequestSubmission(block.payload, values));
      }}
    >
      <p className="text-[13px] font-semibold text-[#111111]">{block.payload.title}</p>
      <div className="mt-3 space-y-3">
        {block.payload.fields.map((field) => (
          <label key={field.key} className="block">
            <span className="text-[11.5px] font-medium text-[#555555]">
              {field.label}
              {field.required ? " *" : ""}
            </span>
            {field.inputType === "textarea" ? (
              <textarea
                className="mt-1 min-h-[76px] w-full resize-none rounded-[8px] border border-[#E0E0E0] bg-transparent px-3 py-2 text-[13px] text-[#111111] outline-none focus:border-[#111111]"
                placeholder={field.placeholder}
                required={field.required}
                value={String(values[field.key] ?? "")}
                onChange={(event) =>
                  setValues((prev) => ({ ...prev, [field.key]: event.target.value }))
                }
              />
            ) : field.inputType === "select" ? (
              <select
                className="mt-1 h-10 w-full rounded-[8px] border border-[#E0E0E0] bg-[#FFFFFF] px-3 text-[13px] text-[#111111] outline-none focus:border-[#111111]"
                required={field.required}
                value={String(values[field.key] ?? "")}
                onChange={(event) =>
                  setValues((prev) => ({ ...prev, [field.key]: event.target.value }))
                }
              >
                <option value="">Select...</option>
                {(field.options ?? []).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : field.inputType === "checkbox" ? (
              <input
                type="checkbox"
                className="mt-2 h-4 w-4 accent-[#111111]"
                checked={values[field.key] === true}
                onChange={(event) =>
                  setValues((prev) => ({ ...prev, [field.key]: event.target.checked }))
                }
              />
            ) : (
              <input
                type={field.inputType === "date" || field.inputType === "time" ? field.inputType : "text"}
                className="mt-1 h-10 w-full rounded-[8px] border border-[#E0E0E0] bg-transparent px-3 text-[13px] text-[#111111] outline-none focus:border-[#111111]"
                placeholder={field.placeholder}
                required={field.required}
                value={String(values[field.key] ?? "")}
                onChange={(event) =>
                  setValues((prev) => ({ ...prev, [field.key]: event.target.value }))
                }
              />
            )}
          </label>
        ))}
      </div>
      <button
        type="submit"
        className="mt-3 h-9 rounded-[8px] bg-[#0A0A0A] px-3 text-[12px] font-semibold text-[#FFFFFF]"
      >
        {block.payload.submitLabel ?? "Continue"}
      </button>
    </form>
  );
}

function ChoiceRequestCard({
  block,
  onStructuredSubmit,
}: {
  block: Extract<ContentBlock, { type: "choice_request" }>;
  onStructuredSubmit?: (text: string) => void | Promise<void>;
}) {
  return (
    <div className="w-full max-w-[520px] rounded-[10px] border border-[#E0E0E0] bg-[#FFFFFF] p-3.5">
      <p className="text-[13px] font-semibold text-[#111111]">{block.payload.question}</p>
      <div className="mt-3 space-y-2">
        {block.payload.choices.map((choice) => (
          <button
            key={choice.id}
            type="button"
            className="block w-full rounded-[8px] border border-[#E0E0E0] px-3 py-2 text-left transition hover:border-[#111111]"
            onClick={() =>
              void onStructuredSubmit?.(
                serializeChoiceRequestSubmission(block.payload, choice.id)
              )
            }
          >
            <span className="block text-[13px] font-medium text-[#111111]">{choice.label}</span>
            {choice.description && (
              <span className="mt-0.5 block text-[11.5px] text-[#777777]">
                {choice.description}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
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
