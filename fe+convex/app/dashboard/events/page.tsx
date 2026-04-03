"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { CalendarDays } from "lucide-react";
import { DashboardPageShell } from "@/components/dashboard/PageShell";
import { api } from "@/convex/_generated/api";

const statusOptions = ["all", "draft", "matching", "outreach", "completed"] as const;
const readinessOptions = ["all", "unstarted", "searching", "confirmed"] as const;
const semesterOptions = [
  { value: "all", label: "All time" },
  { value: "tbd", label: "TBD" },
  { value: "fall_2025", label: "Fall 2025", start: "2025-09-02", end: "2025-12-11" },
  { value: "january_2026", label: "January 2026", start: "2026-01-05", end: "2026-01-16" },
  { value: "spring_2026", label: "Spring 2026", start: "2026-01-20", end: "2026-05-05" },
  { value: "summer_2026", label: "Summer 2026", start: "2026-05-18", end: "2026-08-12" },
  { value: "custom", label: "Custom range" },
] as const;

type StatusFilter = (typeof statusOptions)[number];
type ReadinessFilter = (typeof readinessOptions)[number];
type SemesterFilter = (typeof semesterOptions)[number]["value"];

function formatStatus(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function getEventStatusTone(status: string) {
  switch (status) {
    case "matching":
      return { label: "Matching", className: "text-[#B7791F]" };
    case "outreach":
      return { label: "Outreaching", className: "text-[#2563EB]" };
    case "completed":
      return { label: "Confirmed", className: "text-[#15803D]" };
    case "draft":
    default:
      return { label: "Draft", className: "text-[#7B7B7B]" };
  }
}

function getReadinessTone(confirmed: boolean, status: string) {
  if (confirmed) {
    return { label: "Confirmed", className: "text-[#15803D]" };
  }

  if (status === "matching" || status === "outreach") {
    return { label: "Searching", className: "text-[#2563EB]" };
  }

  return { label: "Unstarted", className: "text-[#7B7B7B]" };
}

function formatEventDate(eventDate?: string): string {
  if (!eventDate) return "TBD";
  const date = new Date(eventDate);
  if (Number.isNaN(date.getTime())) return eventDate;
  return date.toLocaleDateString();
}

function getReadinessValue(confirmed: boolean, status: string): Exclude<ReadinessFilter, "all"> {
  if (confirmed) return "confirmed";
  if (status === "matching" || status === "outreach") return "searching";
  return "unstarted";
}

function formatDateForFilter(value: string) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

export default function EventsPage() {
  const closeFilterTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [openFilter, setOpenFilter] = useState<null | "status" | "speaker" | "room" | "time">(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [speakerFilter, setSpeakerFilter] = useState<ReadinessFilter>("all");
  const [roomFilter, setRoomFilter] = useState<ReadinessFilter>("all");
  const [semesterFilter, setSemesterFilter] = useState<SemesterFilter>("all");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [search, setSearch] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null);

  const events = useQuery(api.events.listEvents, {
    status: statusFilter === "all" ? undefined : statusFilter,
  });
  const deleteEvent = useMutation((api.events as typeof api.events & { deleteEvent: never }).deleteEvent);
  const hasActiveFilters =
    search.length > 0 ||
    statusFilter !== "all" ||
    speakerFilter !== "all" ||
    roomFilter !== "all" ||
    semesterFilter !== "all" ||
    customStartDate.length > 0 ||
    customEndDate.length > 0;

  const filteredEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = events ?? [];
      const selectedSemester = semesterOptions.find((option) => option.value === semesterFilter);
      const rangeStart = semesterFilter === "custom" ? customStartDate : selectedSemester?.start;
      const rangeEnd = semesterFilter === "custom" ? customEndDate : selectedSemester?.end;

    return rows.filter((event) => {
      const title = event.title.toLowerCase();
      const description = (event.description ?? "").toLowerCase();
      const location = (event.location ?? "").toLowerCase();
      const matchesSearch = !q || title.includes(q) || description.includes(q) || location.includes(q);

      const speakerReadiness = getReadinessValue(!!event.speaker_confirmed, event.status);
      const roomReadiness = getReadinessValue(!!event.room_confirmed, event.status);
      const matchesSpeaker = speakerFilter === "all" || speakerReadiness === speakerFilter;
      const matchesRoom = roomFilter === "all" || roomReadiness === roomFilter;

      let matchesTime = true;
      if (semesterFilter === "tbd") {
        matchesTime = !event.event_date;
      } else if (rangeStart && rangeEnd) {
        const eventDate = event.event_date ?? "";
        matchesTime = !!eventDate && eventDate >= rangeStart && eventDate <= rangeEnd;
      }

      return matchesSearch && matchesSpeaker && matchesRoom && matchesTime;
    });
  }, [events, search, speakerFilter, roomFilter, semesterFilter, customStartDate, customEndDate]);

  function openFilterMenu(filter: "status" | "speaker" | "room" | "time") {
    if (closeFilterTimeoutRef.current) {
      clearTimeout(closeFilterTimeoutRef.current);
      closeFilterTimeoutRef.current = null;
    }
    setOpenFilter(filter);
  }

  function scheduleCloseFilter(filter: "status" | "speaker" | "room" | "time") {
    if (closeFilterTimeoutRef.current) {
      clearTimeout(closeFilterTimeoutRef.current);
    }

    closeFilterTimeoutRef.current = setTimeout(() => {
      setOpenFilter((current) => (current === filter ? null : current));
      closeFilterTimeoutRef.current = null;
    }, 320);
  }

  function resetFilters() {
    setSearch("");
    setStatusFilter("all");
    setSpeakerFilter("all");
    setRoomFilter("all");
    setSemesterFilter("all");
    setCustomStartDate("");
    setCustomEndDate("");
    setOpenFilter(null);
  }

  async function handleDelete(eventId: string, title: string) {
    const confirmed = window.confirm(`Delete "${title}"? This cannot be undone.`);
    if (!confirmed) return;

    setDeletingEventId(eventId);
    setDeleteError(null);

    try {
      await deleteEvent({ event_id: eventId as never });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not delete event.";
      setDeleteError(message);
    } finally {
      setDeletingEventId(null);
    }
  }

  return (
    <DashboardPageShell
      title="Events"
      action={
        <Link
          href="/dashboard/events/new"
          className="inline-flex h-10 items-center gap-2 rounded-[8px] border border-[#E0E0E0] bg-[#FFFFFF] px-4 text-[13px] font-medium text-[#111111] transition hover:bg-[#F4F4F4]"
        >
          <span className="text-[16px] leading-none">+</span>
          <span>New event</span>
        </Link>
      }
    >
      <section className="rounded-[14px] border border-[#EBEBEB] bg-[#FFFFFF] p-4">
        <div className="flex flex-col gap-3">
          <input
            type="text"
            placeholder="Search events"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full rounded-[8px] border border-[#E0E0E0] bg-transparent px-[14px] text-[14px] font-normal tracking-[-0.01em] text-[#111111] placeholder:font-normal placeholder:tracking-normal placeholder:text-[#999999] outline-none transition focus:border-[#111111]"
          />
          <div className="flex flex-wrap items-center gap-5">
            <div
              className="relative min-w-[120px]"
              onMouseEnter={() => openFilterMenu("status")}
              onMouseLeave={() => scheduleCloseFilter("status")}
            >
              <button
                type="button"
                className="text-[12px] font-medium text-[#555555] transition hover:text-[#111111]"
              >
                Status
              </button>
              <div
                className={`absolute left-0 top-full z-20 mt-2 min-w-[160px] flex-col gap-1 rounded-[10px] border border-[#EBEBEB] bg-[#FFFFFF] p-2 shadow-sm ${
                  openFilter === "status" ? "flex" : "hidden"
                }`}
              >
                {statusOptions.map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setStatusFilter(status)}
                    className={`rounded-[6px] px-2 py-1 text-left text-[12px] transition ${
                      statusFilter === status ? "bg-[#F4F4F4] font-semibold text-[#111111]" : "text-[#6B6B6B] hover:bg-[#FAFAFA]"
                    }`}
                  >
                    {status === "all" ? "All statuses" : formatStatus(status === "outreach" ? "outreaching" : status)}
                  </button>
                ))}
              </div>
            </div>

            <div
              className="relative min-w-[120px]"
              onMouseEnter={() => openFilterMenu("speaker")}
              onMouseLeave={() => scheduleCloseFilter("speaker")}
            >
              <button
                type="button"
                className="text-[12px] font-medium text-[#555555] transition hover:text-[#111111]"
              >
                Speaker
              </button>
              <div
                className={`absolute left-0 top-full z-20 mt-2 min-w-[170px] flex-col gap-1 rounded-[10px] border border-[#EBEBEB] bg-[#FFFFFF] p-2 shadow-sm ${
                  openFilter === "speaker" ? "flex" : "hidden"
                }`}
              >
                {readinessOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setSpeakerFilter(option)}
                    className={`rounded-[6px] px-2 py-1 text-left text-[12px] transition ${
                      speakerFilter === option ? "bg-[#F4F4F4] font-semibold text-[#111111]" : "text-[#6B6B6B] hover:bg-[#FAFAFA]"
                    }`}
                  >
                    {option === "all" ? "All speaker states" : formatStatus(option)}
                  </button>
                ))}
              </div>
            </div>

            <div
              className="relative min-w-[120px]"
              onMouseEnter={() => openFilterMenu("room")}
              onMouseLeave={() => scheduleCloseFilter("room")}
            >
              <button
                type="button"
                className="text-[12px] font-medium text-[#555555] transition hover:text-[#111111]"
              >
                Room
              </button>
              <div
                className={`absolute left-0 top-full z-20 mt-2 min-w-[160px] flex-col gap-1 rounded-[10px] border border-[#EBEBEB] bg-[#FFFFFF] p-2 shadow-sm ${
                  openFilter === "room" ? "flex" : "hidden"
                }`}
              >
                {readinessOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setRoomFilter(option)}
                    className={`rounded-[6px] px-2 py-1 text-left text-[12px] transition ${
                      roomFilter === option ? "bg-[#F4F4F4] font-semibold text-[#111111]" : "text-[#6B6B6B] hover:bg-[#FAFAFA]"
                    }`}
                  >
                    {option === "all" ? "All room states" : formatStatus(option)}
                  </button>
                ))}
              </div>
            </div>

            <div
              className="relative min-w-[220px]"
              onMouseEnter={() => openFilterMenu("time")}
              onMouseLeave={() => scheduleCloseFilter("time")}
            >
              <button
                type="button"
                className="text-[12px] font-medium text-[#555555] transition hover:text-[#111111]"
              >
                Time
              </button>
              <div
                className={`absolute left-0 top-full z-20 mt-2 min-w-[280px] flex-col gap-3 rounded-[10px] border border-[#EBEBEB] bg-[#FFFFFF] p-3 shadow-sm ${
                  openFilter === "time" ? "flex" : "hidden"
                }`}
              >
                <div className="flex flex-col gap-1">
                  {semesterOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setSemesterFilter(option.value)}
                      className={`rounded-[6px] px-2 py-1 text-left text-[12px] transition ${
                        semesterFilter === option.value ? "bg-[#F4F4F4] font-semibold text-[#111111]" : "text-[#6B6B6B] hover:bg-[#FAFAFA]"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                <div className="rounded-[8px] border border-[#F0F0F0] bg-[#FAFAFA] p-2">
                  <div className="mb-2 flex items-center gap-2 text-[12px] font-medium text-[#555555]">
                    <CalendarDays className="h-3.5 w-3.5" />
                    <span>Custom range</span>
                  </div>
                  <div className="grid gap-2">
                    <label className="grid gap-1 text-[11px] text-[#7B7B7B]">
                      <span>Start date</span>
                      <input
                        type="date"
                        value={customStartDate}
                        onChange={(e) => {
                          setCustomStartDate(e.target.value);
                          setSemesterFilter("custom");
                        }}
                        className="h-9 rounded-[8px] border border-[#E0E0E0] bg-[#FFFFFF] px-3 text-[12px] text-[#111111] outline-none transition focus:border-[#111111]"
                      />
                    </label>
                    <label className="grid gap-1 text-[11px] text-[#7B7B7B]">
                      <span>End date</span>
                      <input
                        type="date"
                        value={customEndDate}
                        onChange={(e) => {
                          setCustomEndDate(e.target.value);
                          setSemesterFilter("custom");
                        }}
                        className="h-9 rounded-[8px] border border-[#E0E0E0] bg-[#FFFFFF] px-3 text-[12px] text-[#111111] outline-none transition focus:border-[#111111]"
                      />
                    </label>
                    {semesterFilter === "custom" && customStartDate && customEndDate ? (
                      <p className="text-[11px] text-[#7B7B7B]">
                        {formatDateForFilter(customStartDate)} - {formatDateForFilter(customEndDate)}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={resetFilters}
              disabled={!hasActiveFilters}
              className="text-[12px] font-medium text-[#000000] transition hover:text-[#000000] disabled:cursor-not-allowed disabled:text-[#BBBBBB]"
            >
              Reset
            </button>
          </div>
        </div>
      </section>

      {deleteError ? (
        <section className="rounded-[8px] border border-[#F3C7CC] bg-[#FFF4F5] px-4 py-3 text-[13px] font-medium text-[#C2182B]">
          {deleteError}
        </section>
      ) : null}

      <section className="overflow-hidden rounded-[14px] border border-[#EBEBEB] bg-[#FFFFFF]">
        {events === undefined ? (
          <div className="p-8 text-center text-[14px] text-[#6B6B6B]">Loading events...</div>
        ) : filteredEvents.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#EBEBEB] bg-[#F4F4F4]">
                  <th className="h-10 px-4 text-left text-[11px] font-semibold tracking-[0.04em] text-[#6B6B6B]">
                    EVENT
                  </th>
                  <th className="h-10 px-4 text-left text-[11px] font-semibold tracking-[0.04em] text-[#6B6B6B]">
                    DATE
                  </th>
                  <th className="h-10 px-4 text-left text-[11px] font-semibold tracking-[0.04em] text-[#6B6B6B]">
                    STATUS
                  </th>
                  <th className="h-10 px-4 text-left text-[11px] font-semibold tracking-[0.04em] text-[#6B6B6B]">
                    SPEAKER
                  </th>
                  <th className="h-10 px-4 text-left text-[11px] font-semibold tracking-[0.04em] text-[#6B6B6B]">
                    ROOM
                  </th>
                  <th className="h-10 px-4 text-right text-[11px] font-semibold tracking-[0.04em] text-[#6B6B6B]">
                    ACTION
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EBEBEB]">
                {filteredEvents.map((event) => {
                  const eventStatus = getEventStatusTone(event.status);
                  const speakerStatus = getReadinessTone(!!event.speaker_confirmed, event.status);
                  const roomStatus = getReadinessTone(!!event.room_confirmed, event.status);

                  return (
                  <tr key={event._id} className="hover:bg-[#FAFAFA]">
                    <td className="px-4 py-3.5">
                      <Link
                        href={`/dashboard/events/${event._id}`}
                        className="text-[14px] font-medium text-[#111111] transition hover:text-[#444444]"
                      >
                        {event.title}
                      </Link>
                      <p className="text-[12px] text-[#999999]">
                        {event.description?.trim() || "No description yet"}
                      </p>
                    </td>
                    <td className="px-4 py-3.5 text-[13px] text-[#6B6B6B]">
                      {formatEventDate(event.event_date)}
                    </td>
                    <td className={`px-4 py-3.5 text-[12px] font-medium ${eventStatus.className}`}>
                      {eventStatus.label}
                    </td>
                    <td className={`px-4 py-3.5 text-[12px] font-medium ${speakerStatus.className}`}>
                      {speakerStatus.label}
                    </td>
                    <td className={`px-4 py-3.5 text-[12px] font-medium ${roomStatus.className}`}>
                      {roomStatus.label}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end">
                        <button
                          type="button"
                          onClick={() => void handleDelete(event._id, event.title)}
                          disabled={deletingEventId === event._id}
                          className="text-[12px] font-medium leading-none text-[#7B7B7B] transition hover:text-[#444444] disabled:cursor-not-allowed disabled:text-[#C7C7C7]"
                        >
                          {deletingEventId === event._id ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-[14px] text-[#6B6B6B]">No events found</div>
        )}
      </section>
    </DashboardPageShell>
  );
}
