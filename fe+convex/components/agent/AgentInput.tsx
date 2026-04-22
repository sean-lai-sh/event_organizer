"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { ArrowUp } from "lucide-react";

interface AgentInputProps {
  onSubmit: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
  value?: string;
  onValueChange?: (value: string) => void;
}

export function AgentInput({
  onSubmit,
  disabled = false,
  placeholder = "Message the agent...",
  value,
  onValueChange,
}: AgentInputProps) {
  const [internalValue, setInternalValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composerValue = value ?? internalValue;

  function setComposerValue(nextValue: string) {
    if (value === undefined) {
      setInternalValue(nextValue);
    }
    onValueChange?.(nextValue);
  }

  function handleSubmit() {
    const trimmed = composerValue.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setComposerValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handleInput() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  const canSend = composerValue.trim().length > 0 && !disabled;

  return (
    <div className="border-t border-[#EBEBEB] bg-[#FFFFFF] px-4 py-3">
      <div className="relative flex items-end gap-2 rounded-[10px] border border-[#E0E0E0] bg-[#FAFAFA] px-3 py-2.5 transition-colors duration-100 focus-within:border-[#CFCFCF] focus-within:bg-[#FFFFFF]">
        <textarea
          ref={textareaRef}
          value={composerValue}
          onChange={(e) => setComposerValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          disabled={disabled}
          rows={1}
          placeholder={placeholder}
          className="max-h-40 flex-1 resize-none bg-transparent text-[13.5px] leading-[1.5] text-[#111111] placeholder:text-[#BBBBBB] focus:outline-none disabled:opacity-50"
          style={{ fontFamily: "var(--font-geist-sans)" }}
        />
        <button
          onClick={handleSubmit}
          disabled={!canSend}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-[#0A0A0A] text-white transition-all duration-100 hover:bg-[#222222] active:scale-[0.93] disabled:bg-[#E0E0E0] disabled:text-[#BBBBBB]"
          style={{ transition: "transform 120ms ease-out, background-color 100ms ease-out" }}
          aria-label="Send message"
        >
          <ArrowUp className="h-4 w-4" strokeWidth={2.2} />
        </button>
      </div>
      <p className="mt-1.5 px-1 text-[11px] text-[#BBBBBB]">
        Enter to send. Shift+Enter for new line
      </p>
    </div>
  );
}
