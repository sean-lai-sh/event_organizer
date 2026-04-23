"use client";

/**
 * ScoreBreakdown — displays all 8 scoring dimensions with a bar chart.
 */

import { SCORE_DIMENSION_LABELS, scoreTierLabel, scoreTierColor, confidenceTierLabel } from "@/lib/speaker-crm/scoring";
import type { CandidateScoreWithId } from "@/lib/speaker-crm/types";

interface ScoreBreakdownProps {
  score: CandidateScoreWithId;
}

export function ScoreBreakdown({ score }: ScoreBreakdownProps) {
  const tierColor = scoreTierColor(score.overallScore);

  return (
    <div className="space-y-4">
      {/* Overall score header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-[32px] font-bold leading-none text-[#111111]">
            {score.overallScore.toFixed(1)}
          </span>
          <div>
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${tierColor}`}
            >
              {scoreTierLabel(score.overallScore)}
            </span>
            <p className="mt-0.5 text-[11px] text-[#9B9B9B]">
              Confidence: {confidenceTierLabel(score.confidence)} ({Math.round(score.confidence * 100)}%)
            </p>
          </div>
        </div>
        <div className="text-right text-[11px] text-[#AAAAAA]">
          <p>{score.modelName}</p>
          <p>{score.promptVersion}</p>
        </div>
      </div>

      {/* Dimension bars */}
      <div className="space-y-2">
        {SCORE_DIMENSION_LABELS.map(({ key, label, weight }) => {
          const val = score[key];
          const pct = (val / 10) * 100;
          return (
            <div key={key} className="space-y-1">
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-[#3B3B3B]">
                  {label}{" "}
                  <span className="text-[#AAAAAA]">×{(weight * 100).toFixed(0)}%</span>
                </span>
                <span className="font-medium text-[#111111]">{val.toFixed(1)}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#F0F0F0]">
                <div
                  className={`h-full rounded-full transition-all ${
                    val >= 7.5
                      ? "bg-emerald-500"
                      : val >= 5.5
                      ? "bg-blue-500"
                      : val >= 3.5
                      ? "bg-amber-400"
                      : "bg-red-400"
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Strengths */}
      {score.strengths.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-[#6B6B6B]">
            Strengths
          </p>
          <ul className="space-y-1">
            {score.strengths.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-[13px] text-[#3B3B3B]">
                <span className="mt-0.5 text-emerald-500">✓</span>
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Concerns */}
      {score.concerns.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-[#6B6B6B]">
            Concerns
          </p>
          <ul className="space-y-1">
            {score.concerns.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-[13px] text-[#3B3B3B]">
                <span className="mt-0.5 text-amber-500">!</span>
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Rationale */}
      <div>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-[#6B6B6B]">
          Rationale
        </p>
        <p className="text-[13px] leading-relaxed text-[#555555]">{score.rationale}</p>
      </div>
    </div>
  );
}
