"use client";

import { useQuery } from "convex/react";
import { api } from "@convex-dev/generated/api";
import Link from "next/link";
import { useState, useMemo } from "react";

// Mock API calls - replace with real Convex queries
const useEvents = () => {
  // TODO: Replace with real Convex query
  return [
    {
      _id: "1",
      title: "Tech Conference 2026",
      description: "Annual company tech conference",
      event_date: "2026-04-15",
      status: "matching",
      speaker_confirmed: false,
      room_confirmed: true,
      needs_outreach: true,
      created_at: Date.now(),
    },
    {
      _id: "2",
      title: "Product Launch Event",
      description: "New product announcement",
      event_date: "2026-05-01",
      status: "outreach",
      speaker_confirmed: true,
      room_confirmed: true,
      needs_outreach: false,
      created_at: Date.now(),
    },
  ];
};

const useSpeakerStats = () => {
  return {
    totalContacts: 45,
    confirmed: 8,
    pending: 15,
    declined: 3,
    noResponse: 19,
  };
};

const useThreadStats = () => {
  return {
    totalThreads: 28,
    awaiting_reply: 12,
    resolved: 16,
  };
};

const StatCard = ({
  label,
  value,
  subtext,
  icon,
  color,
}: {
  label: string;
  value: number | string;
  subtext?: string;
  icon: React.ReactNode;
  color: "blue" | "green" | "orange" | "purple";
}) => {
  const colorClasses = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
    orange: "bg-orange-50 text-orange-600",
    purple: "bg-purple-50 text-purple-600",
  };

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm hover:shadow-md transition">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-zinc-600">{label}</p>
          <p className="text-3xl font-bold text-zinc-900 mt-2">{value}</p>
          {subtext && <p className="text-xs text-zinc-500 mt-1">{subtext}</p>}
        </div>
        <div className={`rounded-lg p-3 ${colorClasses[color]}`}>{icon}</div>
      </div>
    </div>
  );
};

const StatusBadge = ({ status }: { status: string }) => {
  const statusConfig = {
    draft: { bg: "bg-gray-100", text: "text-gray-700" },
    matching: { bg: "bg-blue-100", text: "text-blue-700" },
    outreach: { bg: "bg-purple-100", text: "text-purple-700" },
    completed: { bg: "bg-green-100", text: "text-green-700" },
  };

  const config =
    statusConfig[status as keyof typeof statusConfig] || statusConfig.draft;

  return (
    <span
      className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${config.bg} ${config.text}`}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
};

export default function DashboardPage() {
  const events = useEvents();
  const speakerStats = useSpeakerStats();
  const threadStats = useThreadStats();

  const upcomingEvents = useMemo(() => {
    return events.slice(0, 3);
  }, [events]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900">Dashboard</h1>
          <p className="text-zinc-600 mt-1">
            Welcome back! Here's your event organization overview.
          </p>
        </div>
        <Link
          href="/dashboard/events/new"
          className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition"
        >
          + New Event
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Active Events"
          value={events.length}
          subtext={`${events.filter((e) => e.status !== "completed").length} in progress`}
          color="blue"
          icon={
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h18M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          }
        />
        <StatCard
          label="Confirmed Speakers"
          value={speakerStats.confirmed}
          subtext={`${((speakerStats.confirmed / speakerStats.totalContacts) * 100).toFixed(0)}% of contacts`}
          color="green"
          icon={
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          }
        />
        <StatCard
          label="Pending Responses"
          value={speakerStats.pending}
          subtext={`${speakerStats.noResponse} with no response yet`}
          color="orange"
          icon={
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          }
        />
        <StatCard
          label="Active Threads"
          value={threadStats.totalThreads}
          subtext={`${threadStats.awaiting_reply} awaiting reply`}
          color="purple"
          icon={
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          }
        />
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Upcoming Events */}
        <div className="lg:col-span-2">
          <div className="rounded-lg border border-zinc-200 bg-white shadow-sm">
            <div className="border-b border-zinc-200 p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-zinc-900">
                  Upcoming Events
                </h2>
                <Link
                  href="/dashboard/events"
                  className="text-sm text-blue-600 hover:underline"
                >
                  View All
                </Link>
              </div>
            </div>

            <div className="divide-y divide-zinc-200">
              {upcomingEvents.map((event) => (
                <div
                  key={event._id}
                  className="p-6 hover:bg-zinc-50 transition"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold text-zinc-900">
                          {event.title}
                        </h3>
                        <StatusBadge status={event.status} />
                      </div>
                      <p className="text-sm text-zinc-600 mt-1">
                        {event.description}
                      </p>
                      <div className="flex items-center gap-4 mt-3 text-sm text-zinc-500">
                        <span>
                          📅{" "}
                          {new Date(
                            event.event_date || "",
                          ).toLocaleDateString()}
                        </span>
                        {event.speaker_confirmed && (
                          <span className="text-green-600">
                            ✓ Speaker Confirmed
                          </span>
                        )}
                        {event.room_confirmed && (
                          <span className="text-green-600">
                            ✓ Room Confirmed
                          </span>
                        )}
                      </div>
                    </div>
                    <Link
                      href={`/dashboard/events/${event._id}`}
                      className="text-blue-600 hover:underline text-sm font-medium"
                    >
                      View →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="space-y-4">
          <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
            <h3 className="font-semibold text-zinc-900 mb-4">Quick Actions</h3>
            <div className="space-y-2">
              <Link
                href="/dashboard/events/new"
                className="block w-full text-left px-4 py-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition text-sm font-medium"
              >
                Create Event
              </Link>
              <Link
                href="/dashboard/speakers"
                className="block w-full text-left px-4 py-2 rounded-lg border border-zinc-200 hover:bg-zinc-50 transition text-sm font-medium text-zinc-700"
              >
                View Speakers
              </Link>
              <Link
                href="/dashboard/communications"
                className="block w-full text-left px-4 py-2 rounded-lg border border-zinc-200 hover:bg-zinc-50 transition text-sm font-medium text-zinc-700"
              >
                Email Threads
              </Link>
            </div>
          </div>

          {/* Progress Indicators */}
          <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
            <h3 className="font-semibold text-zinc-900 mb-4">
              Speaker Outreach
            </h3>
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-zinc-600">
                    Progress
                  </span>
                  <span className="text-xs text-zinc-500">
                    {speakerStats.confirmed} / {speakerStats.totalContacts}
                  </span>
                </div>
                <div className="h-2 bg-zinc-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 transition-all"
                    style={{
                      width: `${(speakerStats.confirmed / speakerStats.totalContacts) * 100}%`,
                    }}
                  />
                </div>
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-zinc-600">✓ Confirmed</span>
                  <span className="font-medium text-green-600">
                    {speakerStats.confirmed}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-600">⏳ Pending</span>
                  <span className="font-medium text-orange-600">
                    {speakerStats.pending}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-600">✗ Declined</span>
                  <span className="font-medium text-red-600">
                    {speakerStats.declined}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
