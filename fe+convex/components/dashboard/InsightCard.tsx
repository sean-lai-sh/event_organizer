import Link from "next/link";
import { Sparkles } from "lucide-react";

type Insight = {
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
}: {
  insight: Insight | null;
  hasData: boolean;
}) {
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
            <Link
              href="/dashboard/agent?context=attendance"
              className="text-[13px] font-medium text-[#111111] transition-colors duration-[120ms] hover:text-[#555555]"
            >
              Chat about this →
            </Link>
          </div>
        </>
      ) : hasData ? (
        <p className="mt-3 text-[13px] text-[#999999]">
          Import complete. Run the insight agent to see analysis here.
        </p>
      ) : (
        <p className="mt-3 text-[13px] text-[#999999]">
          No insights yet. Import attendance data to get started.
        </p>
      )}
    </div>
  );
}
