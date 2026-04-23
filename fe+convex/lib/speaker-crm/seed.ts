/**
 * Speaker CRM — seed data for local development and demo.
 *
 * Run via: npx ts-node -e "require('./lib/speaker-crm/seed').seedSpeakerCRM()"
 * Or call seedSpeakerCRM() from a script that connects to Convex.
 *
 * Creates 2 sample events with personas, candidates, and scores.
 */

import type { SpeakerEventBrief } from "./types";
import type { ApolloPersonRaw } from "./types";

// ─── Sample Event Briefs ──────────────────────────────────────────────────────

export const SEED_EVENTS: SpeakerEventBrief[] = [
  {
    name: "Spring Founder Fireside 2026",
    eventType: "founder_fireside",
    description:
      "A fireside chat series for students curious about the early-stage startup journey. Founders share raw lessons about building, fundraising, and finding PMF before their first million in ARR.",
    audienceSummary:
      "CS and business students at Stanford and UC Berkeley interested in starting companies. Mix of freshmen to PhD students. Many exploring their first side project.",
    audienceSize: 80,
    locationCity: "San Francisco",
    locationRegion: "CA",
    dateWindowStart: "2026-04-15",
    dateWindowEnd: "2026-05-30",
    themeTags: ["early-stage startup", "fundraising", "PMF", "founder journey"],
    mustHaveTags: ["founder or co-founder", "seed or Series A stage", "hands-on operator"],
    niceToHaveTags: ["YC alum", "technical founder", "first-generation founder"],
    exclusionTags: ["recruiter", "VC only (no operating experience)", "sales-only role"],
    budgetTier: "unpaid",
    targetCandidateCount: 20,
  },
  {
    name: "Growth & GTM Workshop 2026",
    eventType: "workshop",
    description:
      "An interactive workshop on growth strategies for B2B SaaS startups. Attendees learn acquisition loops, retention tactics, and growth experimentation from operators who have scaled real products.",
    audienceSummary:
      "Early-stage founders, PMs, and growth marketers building B2B SaaS products. Some participants have early traction, others are pre-launch.",
    audienceSize: 50,
    locationCity: "New York",
    locationRegion: "NY",
    dateWindowStart: "2026-05-01",
    dateWindowEnd: "2026-06-15",
    themeTags: ["growth", "GTM", "B2B SaaS", "product-led growth", "acquisition"],
    mustHaveTags: ["growth or GTM operator experience", "B2B SaaS background", "startup stage"],
    niceToHaveTags: ["product-led growth (PLG) experience", "Series B or later reference"],
    exclusionTags: ["agency", "consultant without operator background", "enterprise-only"],
    budgetTier: "low",
    targetCandidateCount: 15,
  },
];

// ─── Sample candidate profiles (used in mock sourcing) ───────────────────────

export const SEED_CANDIDATES: Omit<ApolloPersonRaw, "id">[] = [
  {
    first_name: "Alex",
    last_name: "Rivera",
    name: "Alex Rivera",
    title: "Co-founder & CEO",
    headline: "Building the future of B2B payments",
    linkedin_url: "https://linkedin.com/in/alexrivera",
    email: "alex@ledgerpay.io",
    city: "San Francisco",
    state: "CA",
    country: "US",
    organization: { name: "LedgerPay", primary_domain: "ledgerpay.io" },
    biography:
      "Alex co-founded LedgerPay out of YC W24. Previously a PM at Stripe. First talk at SaaStr 2025. Loves helping students understand the fundraising process.",
  },
  {
    first_name: "Nadia",
    last_name: "Osei",
    name: "Nadia Osei",
    title: "Head of Growth",
    headline: "Scaled Notion from 0 to 10M users",
    linkedin_url: "https://linkedin.com/in/nadiaosei",
    email: "nadia@growthco.com",
    city: "New York",
    state: "NY",
    country: "US",
    organization: { name: "GrowthCo", primary_domain: "growthco.com" },
    biography:
      "Nadia led growth at Notion from 0 to 10 million users. Previously at Duolingo. Regular speaker at SaaStock and ProductLed Summit.",
  },
];
