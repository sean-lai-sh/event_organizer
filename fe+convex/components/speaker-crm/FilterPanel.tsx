"use client";

/**
 * FilterPanel — left-side filter controls for the review dashboard.
 */

import type { EventCandidateStatus } from "@/lib/speaker-crm/types";

export interface ReviewFilters {
  search: string;
  status: EventCandidateStatus | "all";
  minScore: number;
  personaId: string | "all";
  approvedOnly: boolean;
}

interface FilterPanelProps {
  filters: ReviewFilters;
  onChange: (filters: ReviewFilters) => void;
  personaOptions: Array<{ _id: string; label: string }>;
  stats: {
    total: number;
    approved: number;
    rejected: number;
    saved: number;
  };
}

const STATUS_OPTIONS: Array<{ value: EventCandidateStatus | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "scored", label: "Scored" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "saved_later", label: "Saved for Later" },
  { value: "sourced", label: "Sourced (unscored)" },
];

export function FilterPanel({ filters, onChange, personaOptions, stats }: FilterPanelProps) {
  function update(partial: Partial<ReviewFilters>) {
    onChange({ ...filters, ...partial });
  }

  return (
    <div className="space-y-5">
      {/* Stats summary */}
      <div className="rounded-[10px] border border-[#EBEBEB] bg-[#FAFAFA] p-4">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-[#6B6B6B]">
          Review Progress
        </p>
        <div className="grid grid-cols-2 gap-2">
          <MiniStat label="Total" value={stats.total} />
          <MiniStat label="Approved" value={stats.approved} accent="green" />
          <MiniStat label="Rejected" value={stats.rejected} accent="red" />
          <MiniStat label="Saved" value={stats.saved} accent="amber" />
        </div>
      </div>

      {/* Search */}
      <div>
        <label className="mb-1.5 block text-[12px] font-medium text-[#3B3B3B]">Search</label>
        <input
          type="text"
          value={filters.search}
          onChange={(e) => update({ search: e.target.value })}
          placeholder="Name, company, title…"
          className="h-9 w-full rounded-[7px] border border-[#E0E0E0] bg-transparent px-3 text-[13px] outline-none transition focus:border-[#111111]"
        />
      </div>

      {/* Status */}
      <div>
        <label className="mb-1.5 block text-[12px] font-medium text-[#3B3B3B]">Status</label>
        <div className="space-y-1">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => update({ status: opt.value, approvedOnly: opt.value === "approved" })}
              className={`flex h-8 w-full items-center rounded-[6px] px-3 text-[12px] transition ${
                filters.status === opt.value
                  ? "bg-[#111111] font-medium text-white"
                  : "text-[#555555] hover:bg-[#F4F4F4]"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Min score */}
      <div>
        <label className="mb-1.5 block text-[12px] font-medium text-[#3B3B3B]">
          Min Score: {filters.minScore === 0 ? "Any" : `${filters.minScore}+`}
        </label>
        <input
          type="range"
          min={0}
          max={9}
          step={0.5}
          value={filters.minScore}
          onChange={(e) => update({ minScore: parseFloat(e.target.value) })}
          className="w-full accent-[#111111]"
        />
        <div className="flex justify-between text-[10px] text-[#AAAAAA]">
          <span>Any</span>
          <span>4.5</span>
          <span>6.0</span>
          <span>7.5+</span>
        </div>
      </div>

      {/* Persona filter */}
      {personaOptions.length > 0 && (
        <div>
          <label className="mb-1.5 block text-[12px] font-medium text-[#3B3B3B]">Persona</label>
          <select
            value={filters.personaId}
            onChange={(e) => update({ personaId: e.target.value })}
            className="h-9 w-full rounded-[7px] border border-[#E0E0E0] bg-transparent px-3 text-[13px] outline-none"
          >
            <option value="all">All personas</option>
            {personaOptions.map((p) => (
              <option key={p._id} value={p._id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

function MiniStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "green" | "red" | "amber";
}) {
  const colors = {
    green: "text-emerald-600",
    red: "text-red-500",
    amber: "text-amber-600",
    default: "text-[#111111]",
  };
  const colorCls = accent ? colors[accent] : colors.default;
  return (
    <div className="flex items-center justify-between rounded-[6px] bg-white px-2.5 py-1.5 text-[12px]">
      <span className="text-[#9B9B9B]">{label}</span>
      <span className={`font-bold ${colorCls}`}>{value}</span>
    </div>
  );
}
