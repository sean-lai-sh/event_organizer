export type Feature = {
  label: string;
  desc: string;
};

export type PlatformItem = {
  title: string;
  desc: string;
};

export type Stat = {
  num: string;
  label: string;
};

export const features: Feature[] = [
  {
    label: "Event Creation",
    desc: "Spin up events in seconds. Set dates, venues, capacity, and RSVP deadlines without leaving the dashboard.",
  },
  {
    label: "Speaker Outreach",
    desc: "Track speaker confirmations, bios, and talk details. Know exactly who is confirmed and who is pending.",
  },
  {
    label: "Email Threads",
    desc: "All event communication in one place. Monitor inbound and outbound messages without switching tabs.",
  },
  {
    label: "Attendee Lists",
    desc: "View, filter, and export your guest list. Send targeted updates to any segment of your audience.",
  },
  {
    label: "Club Dashboard",
    desc: "One home for every event your club runs: past events, upcoming ones, and everything in between.",
  },
  {
    label: "Instant Invites",
    desc: "Share a clean event page in one click. Members RSVP without needing an account of their own.",
  },
];

export const platformLeft: PlatformItem[] = [
  {
    title: "Alumni CRM Integration",
    desc: "Attendee history syncs with your alumni network. Every person, every event, one record.",
  },
  {
    title: "Real-time Event Sync",
    desc: "Every RSVP and update propagates instantly across your entire organizing team.",
  },
];

export const platformRight: PlatformItem[] = [
  {
    title: "AI Email Webhooks",
    desc: "Incoming replies are parsed and routed automatically. Progress updates itself.",
  },
  {
    title: "Unified Dashboard",
    desc: "Orchestrates everything into a single view. One place to see where every event stands.",
  },
];

export const stats: Stat[] = [
  { num: "2,400+", label: "Events organized" },
  { num: "18K+", label: "Attendees managed" },
  { num: "340+", label: "Active clubs" },
  { num: "98%", label: "Show-up rate" },
];
