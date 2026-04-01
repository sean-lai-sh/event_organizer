import { describe, expect, test } from "bun:test";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DashboardDataPageBody,
  type DashboardAttendanceStats,
  type DashboardAttendanceTrend,
  type DashboardAttendeeProfile,
  type DashboardEventOption,
} from "./page";
import type { Insight } from "@/components/dashboard/InsightCard";

const events: DashboardEventOption[] = [
  { _id: "evt_1", title: "[Demo] AI Founder Panel" },
  { _id: "evt_2", title: "[Demo] Summer Planning Session" },
];

const stats: DashboardAttendanceStats = {
  total_events_tracked: 5,
  total_unique_attendees: 20,
  avg_attendance: 9,
  top_event: { title: "[Demo] AI Founder Panel", count: 14 },
};

const trends: DashboardAttendanceTrend[] = [
  {
    event_id: "evt_1",
    title: "[Demo] AI Founder Panel",
    event_date: "2026-02-12",
    event_type: "speaker_panel",
    attendee_count: 14,
  },
];

const profiles: DashboardAttendeeProfile[] = [
  {
    email: "alex@example.com",
    name: "Alex Chen",
    events_attended: 1,
    first_seen: "2026-02-12",
    last_seen: "2026-02-12",
    event_types: ["speaker_panel"],
    streak: 1,
    is_active: true,
    interest_prediction: null,
  },
];

const insight: Insight = {
  generated_at: Date.now(),
  insight_text: "Founder panel turnout was the strongest of the seeded demos.",
};

function renderPage(
  overrides: Partial<ComponentProps<typeof DashboardDataPageBody>> = {}
) {
  return renderToStaticMarkup(
    <DashboardDataPageBody
      events={events}
      selectedEventId=""
      onSelectedEventChange={() => undefined}
      stats={stats}
      trends={trends}
      profiles={profiles}
      insight={insight}
      importAction={<span>Import attendance</span>}
      demoSeedAction={<span>Load demo attendance</span>}
      isGeneratingInsight={false}
      insightError={null}
      onGenerateInsight={() => undefined}
      chartContent={<div>chart slot</div>}
      profileContent={<div>profile slot</div>}
      {...overrides}
    />
  );
}

describe("/dashboard/data presentation", () => {
  test("renders aggregate view with populated KPI, chart, profile, and refresh action", () => {
    const markup = renderPage();

    expect(markup).toContain("All events");
    expect(markup).toContain("total events");
    expect(markup).toContain("unique attendees");
    expect(markup).toContain("chart slot");
    expect(markup).toContain("profile slot");
    expect(markup).toContain("Refresh insight");
  });

  test("renders an event-specific no-attendance empty state", () => {
    const markup = renderPage({
      selectedEventId: "evt_2",
      stats: {
        total_events_tracked: 0,
        total_unique_attendees: 0,
        avg_attendance: 0,
        top_event: null,
      },
      trends: [],
      profiles: [],
      insight: null,
    });

    expect(markup).toContain("No attendance recorded for [Demo] Summer Planning Session yet");
    expect(markup).toContain("Import a CSV for this event");
    expect(markup).not.toContain("Load demo attendance");
  });

  test("renders an event-specific no-insight state with generate action", () => {
    const markup = renderPage({
      selectedEventId: "evt_1",
      insight: null,
    });

    expect(markup).toContain("No insight for [Demo] AI Founder Panel yet");
    expect(markup).toContain("Generate insight");
  });
});
