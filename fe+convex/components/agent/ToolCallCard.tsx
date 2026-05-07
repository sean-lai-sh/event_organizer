"use client";

import { Wrench } from "lucide-react";
import type { AgentTraceStep } from "./types";

interface ToolCallCardProps {
  trace: AgentTraceStep;
}

export function ToolCallCard({ trace }: ToolCallCardProps) {
  const isFailure = trace.kind === "tool_failure";
  const tone = isFailure ? "text-[#999999]" : "text-[#0A0A0A]";

  let toolName = trace.summary;
  if (trace.detailJson) {
    try {
      const d = JSON.parse(trace.detailJson);
      if (d.tool) toolName = d.tool;
    } catch {
      /* ignore */
    }
  }
  const label = toolName.replace(/_/g, " ");

  return (
    <div className="mx-auto flex max-w-[520px] items-center gap-2 rounded-[8px] border border-[#E0E0E0] bg-[#FFFFFF] px-3 py-1.5">
      <Wrench
        className={`h-3.5 w-3.5 shrink-0 ${tone}`}
        strokeWidth={2.2}
      />
      <p className={`truncate text-[12.5px] ${tone}`}>{label}</p>
    </div>
  );
}
