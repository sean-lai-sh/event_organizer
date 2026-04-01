import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export type Insight = {
  generated_at: number;
  insight_text: string;
};

function formatRelativeTime(timestamp: number) {
  const elapsed = Date.now() - timestamp;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (elapsed < hour) {
    const minutes = Math.max(1, Math.round(elapsed / minute));
    return `${minutes}m ago`;
  }
  if (elapsed < day) {
    const hours = Math.max(1, Math.round(elapsed / hour));
    return `${hours}h ago`;
  }

  const days = Math.max(1, Math.round(elapsed / day));
  return `${days}d ago`;
}

export function InsightCard({
  insight,
  hasData,
  selectedEventName,
  isGenerating,
  errorMessage,
  onGenerate,
}: {
  insight: Insight | null;
  hasData: boolean;
  selectedEventName?: string | null;
  isGenerating?: boolean;
  errorMessage?: string | null;
  onGenerate?: () => void;
}) {
  const emptyStateCopy = selectedEventName
    ? `No insight for ${selectedEventName} yet. Generate one to summarize this event's attendance.`
    : "No insight yet for this attendance view. Generate one to summarize the current data.";

  return (
    <div className="rounded-[14px] border border-[#EBEBEB] bg-white p-4">
      <div className="flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-[#999999]" />
        <span className="text-[12px] font-semibold uppercase tracking-[0.07em] text-[#999999]">
          AI Insight
        </span>
      </div>

      {insight ? (
        <>
          <p className="mt-3 text-[13px] leading-[1.5] text-[#4d4d4d]">{insight.insight_text}</p>
          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="text-[11px] text-[#999999]">
              Generated {formatRelativeTime(insight.generated_at)}
            </span>
            <Button
              type="button"
              size="xs"
              onClick={onGenerate}
              disabled={isGenerating || !onGenerate}
            >
              {isGenerating ? "Refreshing…" : "Refresh insight"}
            </Button>
          </div>
        </>
      ) : hasData ? (
        <div className="mt-3 space-y-3">
          <p className="text-[13px] text-[#999999]">{emptyStateCopy}</p>
          <Button
            type="button"
            size="xs"
            onClick={onGenerate}
            disabled={isGenerating || !onGenerate}
          >
            {isGenerating ? "Generating…" : "Generate insight"}
          </Button>
        </div>
      ) : (
        <p className="mt-3 text-[13px] text-[#999999]">
          Import attendance data to unlock insights for this view.
        </p>
      )}

      {errorMessage ? (
        <p className="mt-3 text-[12px] text-[#777777]">{errorMessage}</p>
      ) : null}
    </div>
  );
}
