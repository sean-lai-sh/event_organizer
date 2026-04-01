"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type Profile = {
  email: string;
  name: string | null;
  events_attended: number;
  first_seen: string;
  last_seen: string;
  event_types: string[];
  streak: number;
  is_active: boolean;
  interest_prediction: {
    primary_type: string;
    type_distribution: Record<string, number>;
    confidence: "low" | "medium" | "high";
  } | null;
};

type FilterKey = "all" | "2+" | "4+";

const filterThresholds: Record<FilterKey, number> = {
  all: 0,
  "2+": 2,
  "4+": 4,
};

const confidenceDot: Record<NonNullable<Profile["interest_prediction"]>["confidence"], string> = {
  high: "bg-[#0A0A0A]",
  medium: "bg-[#999999]",
  low: "bg-[#CCCCCC]",
};

function formatShortDate(date: string) {
  if (!date) return "—";
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function titleCase(value: string) {
  return value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function AttendeeProfileList({ profiles }: { profiles: Profile[] }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");

  const filteredProfiles = useMemo(() => {
    const query = search.trim().toLowerCase();
    return profiles.filter((profile) => {
      if (profile.events_attended < filterThresholds[filter]) {
        return false;
      }
      if (!query) return true;

      return [
        profile.email,
        profile.name ?? "",
        profile.event_types.join(" "),
        profile.interest_prediction?.primary_type ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [filter, profiles, search]);

  return (
    <TooltipProvider delayDuration={180} skipDelayDuration={0}>
      <section className="rounded-[14px] border border-[#EBEBEB] bg-white">
        <div className="flex flex-col gap-3 border-b border-[#EBEBEB] px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-[#111111]">Attendee profiles</h2>
            <p className="mt-1 text-[13px] text-[#999999]">
              Attendance patterns, recency, and deterministic interest prediction.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search attendees"
              className="h-10 rounded-[8px] border border-[#E0E0E0] px-3 text-[13px] text-[#111111] outline-none placeholder:text-[#BBBBBB] focus:border-[#C8C8C8]"
            />
            <div className="flex items-center gap-2">
              {(["all", "2+", "4+"] as const).map((option) => {
                const active = filter === option;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setFilter(option)}
                    className={[
                      "h-8 rounded-[6px] px-3 text-[12px] transition-transform duration-[120ms] ease-out active:scale-[0.97]",
                      active
                        ? "bg-[#0A0A0A] text-white"
                        : "border border-[#E0E0E0] bg-white text-[#555555] hover:bg-[#F7F7F7]",
                    ].join(" ")}
                  >
                    {option === "all" ? "All" : option}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-[#EBEBEB] bg-[#FAFAFA]">
                {[
                  "Email",
                  "Name",
                  "Events",
                  "Types",
                  "Streak",
                  "Status",
                  "Predicted Interest",
                  "Last Seen",
                ].map((heading) => (
                  <th
                    key={heading}
                    className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#999999]"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredProfiles.length > 0 ? (
                filteredProfiles.map((profile, index) => (
                  <motion.tr
                    key={profile.email}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.15, delay: Math.min(index, 15) * 0.04 }}
                    className="border-b border-[#F0F0F0] align-top last:border-b-0 hover:bg-[#FCFCFC]"
                  >
                    <td className="px-5 py-3 text-[13px] font-medium text-[#111111]">{profile.email}</td>
                    <td className="px-5 py-3 text-[13px] text-[#6B6B6B]">{profile.name ?? "—"}</td>
                    <td className="px-5 py-3 text-[13px] text-[#4D4D4D]">
                      <div className="flex items-center gap-2">
                        <span>{profile.events_attended}</span>
                        {profile.events_attended >= 4 ? (
                          <span className="rounded-[4px] bg-[#F4F4F4] px-1.5 py-0.5 text-[10px] text-[#555555]">
                            Frequent
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {profile.event_types.map((eventType) => (
                          <span
                            key={eventType}
                            className="rounded-[4px] bg-[#F4F4F4] px-1.5 py-0.5 text-[10px] text-[#555555]"
                          >
                            {titleCase(eventType)}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-[13px] text-[#4D4D4D]">
                      {profile.streak > 0 ? `${profile.streak} in a row` : "—"}
                    </td>
                    <td className="px-5 py-3 text-[13px] font-medium">
                      <span className={profile.is_active ? "text-[#111111]" : "text-[#999999]"}>
                        {profile.is_active ? "Active" : "Lapsed"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-[13px] text-[#4D4D4D]">
                      {profile.interest_prediction ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="inline-flex items-center gap-2 rounded-[4px] bg-[#EAEAEA] px-1.5 py-0.5 text-[10px] font-medium text-[#111111] transition-transform duration-[120ms] ease-out hover:scale-[1.01] active:scale-[0.97]"
                            >
                              <span>{titleCase(profile.interest_prediction.primary_type)}</span>
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${confidenceDot[profile.interest_prediction.confidence]}`}
                              />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent
                            side="top"
                            className="rounded-[8px] border border-[#E0E0E0] bg-white p-2 text-[11px] font-medium text-[#555555] shadow-none [transform-origin:var(--radix-tooltip-content-transform-origin)] data-[state=closed]:duration-[125ms] data-[state=closed]:zoom-out-95 data-[state=delayed-open]:duration-[125ms]"
                          >
                            {Object.entries(profile.interest_prediction.type_distribution)
                              .map(([type, count]) => `${titleCase(type)}: ${count}`)
                              .join(", ")}
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-5 py-3 text-[13px] text-[#6B6B6B]">{formatShortDate(profile.last_seen)}</td>
                  </motion.tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-[13px] text-[#999999]">
                    No attendees match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </TooltipProvider>
  );
}
