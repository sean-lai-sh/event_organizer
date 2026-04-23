"use client";

import type { AgentTraceStep, TraceStepKind } from "./types";

interface TraceRailProps {
  traces: AgentTraceStep[];
  collapsed?: boolean;
  onToggle?: () => void;
}

const STEP_COLORS: Record<TraceStepKind, string> = {
  planning: "text-blue-600",
  tool_selection: "text-indigo-600",
  tool_start: "text-gray-600",
  tool_completion: "text-green-600",
  tool_failure: "text-red-600",
  approval_pause: "text-yellow-600",
  approval_resolution: "text-green-700",
  artifact_generation: "text-purple-600",
  thinking: "text-gray-500",
  guardrail_retry: "text-orange-600",
  run_completed: "text-green-700",
  run_error: "text-red-700",
};

function formatKind(kind: TraceStepKind): string {
  return kind
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function TraceRail({ traces, collapsed = true, onToggle }: TraceRailProps) {
  if (traces.length === 0) return null;

  return (
    <div>
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 text-[11px] font-medium text-[#999999] transition-colors hover:text-[#666666]"
        type="button"
      >
        <span
          className="inline-block transition-transform"
          style={{ transform: collapsed ? "rotate(0deg)" : "rotate(90deg)" }}
        >
          &#9654;
        </span>
        Reasoning trace ({traces.length} step{traces.length !== 1 ? "s" : ""})
      </button>

      {!collapsed && (
        <div className="mt-2 ml-2 border-l-2 border-[#E5E5E5] pl-3">
          {traces.map((step) => (
            <div key={step.id} className="relative mb-2 last:mb-0">
              <div
                className="absolute -left-[17px] top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white"
                style={{
                  backgroundColor:
                    step.status === "waiting"
                      ? "#F59E0B"
                      : step.kind === "run_error" || step.kind === "tool_failure"
                        ? "#EF4444"
                        : step.kind === "run_completed"
                          ? "#10B981"
                          : "#9CA3AF",
                }}
              />
              <div className="min-w-0">
                <span
                  className={`text-[11px] font-medium leading-[16px] ${STEP_COLORS[step.kind] ?? "text-gray-600"}`}
                >
                  {formatKind(step.kind)}
                </span>
                <p className="text-[11px] leading-[15px] text-[#777777]">
                  {step.summary}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
