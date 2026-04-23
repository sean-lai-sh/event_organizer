/**
 * Speaker CRM — shared TypeScript types.
 *
 * These mirror the Convex schema but are plain TS types for use in
 * API routes, service layer, and components. Convex's Doc<T> types
 * are authoritative on the DB side; these are used in transit/UI.
 */

// ─── Event Brief ──────────────────────────────────────────────────────────────

export type BudgetTier = "unpaid" | "low" | "medium" | "high";

export type SpeakerEventType =
  | "founder_fireside"
  | "growth_panel"
  | "product_talk"
  | "workshop"
  | "networking";

export type SpeakerEventStatus =
  | "draft"
  | "generating_personas"
  | "sourcing"
  | "enriching"
  | "scoring"
  | "review"
  | "synced";

export interface SpeakerEventBrief {
  name: string;
  eventType: SpeakerEventType;
  description: string;
  audienceSummary: string;
  audienceSize: number;
  locationCity: string;
  locationRegion: string;
  dateWindowStart: string; // YYYY-MM-DD
  dateWindowEnd: string;
  themeTags: string[];
  mustHaveTags: string[];
  niceToHaveTags: string[];
  exclusionTags: string[];
  budgetTier: BudgetTier;
  targetCandidateCount: number;
}

// ─── Persona ──────────────────────────────────────────────────────────────────

export interface SpeakerPersona {
  label: string;
  description: string;
  searchTitles: string[];
  searchKeywords: string[];
  searchLocations: string[];
  searchCompanyTypes: string[];
  priority: number;
}

export interface SpeakerPersonaWithId extends SpeakerPersona {
  _id: string;
  eventId: string;
  createdAt: number;
}

// ─── Candidate ────────────────────────────────────────────────────────────────

export type EnrichmentStatus = "pending" | "enriched" | "failed";
export type SourceSystem = "apollo" | "manual" | "import";

export interface CandidateProfile {
  fullName: string;
  firstName: string;
  lastName: string;
  headline?: string;
  currentTitle?: string;
  companyName?: string;
  companyDomain?: string;
  city?: string;
  region?: string;
  country?: string;
  linkedinUrl?: string;
  websiteUrl?: string;
  email?: string;
  sourceSystem: SourceSystem;
  sourcePersonId?: string;
  sourceProfileUrl?: string;
  bio?: string;
  publicSpeakingEvidence?: string;
  topicTags: string[];
  industryTags: string[];
  audienceTags: string[];
  canonicalHash: string;
  enrichmentStatus: EnrichmentStatus;
  lastEnrichedAt?: number;
}

export interface CandidateProfileWithId extends CandidateProfile {
  _id: string;
  createdAt: number;
  updatedAt: number;
}

// ─── Event Candidate (join) ───────────────────────────────────────────────────

export type EventCandidateStatus =
  | "sourced"
  | "enriched"
  | "scored"
  | "approved"
  | "rejected"
  | "saved_later";

export interface EventCandidate {
  _id: string;
  eventId: string;
  candidateId: string;
  personaId?: string;
  status: EventCandidateStatus;
  discoveryQuery?: string;
  discoveredAt: number;
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

export interface ScoreDimensions {
  topicFit: number;      // 0–10
  audienceFit: number;
  credibility: number;
  speakingFit: number;
  accessibility: number;
  brandPull: number;
  locationFit: number;
  budgetFit: number;
}

export const SCORE_WEIGHTS: ScoreDimensions = {
  topicFit: 0.22,
  audienceFit: 0.18,
  credibility: 0.15,
  speakingFit: 0.12,
  accessibility: 0.10,
  brandPull: 0.10,
  locationFit: 0.08,
  budgetFit: 0.05,
};

export interface CandidateScore extends ScoreDimensions {
  overallScore: number;  // weighted 0–10
  confidence: number;    // 0–1
  strengths: string[];
  concerns: string[];
  evidenceJson: string;  // JSON string { [dimension]: string[] }
  rationale: string;
  modelName: string;
  promptVersion: string;
}

export interface CandidateScoreWithId extends CandidateScore {
  _id: string;
  eventCandidateId: string;
  createdAt: number;
}

// ─── Review ───────────────────────────────────────────────────────────────────

export type ReviewDecision = "approved" | "rejected" | "saved_later";

export interface ReviewDecisionRecord {
  eventCandidateId: string;
  decision: ReviewDecision;
  reasonCodes: string[];
  reviewerNotes?: string;
  reviewedBy?: string;
  reviewedAt: number;
}

// ─── CRM Sync ─────────────────────────────────────────────────────────────────

export interface CRMRecordMap {
  internalEntityType: string;
  internalEntityId: string;
  crmSystem: string;
  crmObjectType: string;
  crmRecordId: string;
  syncedAt: number;
}

// ─── Enriched view (used in review dashboard) ────────────────────────────────

/** Full candidate card as displayed in the review UI */
export interface ReviewCandidateCard {
  eventCandidate: EventCandidate;
  profile: CandidateProfileWithId;
  score?: CandidateScoreWithId;
  review?: ReviewDecisionRecord;
  persona?: SpeakerPersonaWithId;
  crmNote?: string;
}

// ─── Scoring tier labels ──────────────────────────────────────────────────────

export function scoreTier(score: number): "top_pick" | "good_fit" | "maybe" | "pass" {
  if (score >= 7.5) return "top_pick";
  if (score >= 6.0) return "good_fit";
  if (score >= 4.5) return "maybe";
  return "pass";
}

// ─── Pipeline step names ──────────────────────────────────────────────────────

export const PIPELINE_STEPS = [
  "event_brief",
  "persona_generation",
  "search_strategy",
  "candidate_sourcing",
  "enrichment",
  "scoring",
  "review",
  "crm_sync",
] as const;

export type PipelineStep = (typeof PIPELINE_STEPS)[number];

// ─── Apollo raw result (before normalization) ─────────────────────────────────

export interface ApolloPersonRaw {
  id: string;
  first_name: string;
  last_name: string;
  name: string;
  title?: string;
  headline?: string;
  linkedin_url?: string;
  email?: string;
  city?: string;
  state?: string;
  country?: string;
  organization?: {
    name?: string;
    website_url?: string;
    primary_domain?: string;
  };
  biography?: string;
}

// ─── HubSpot contact payload ──────────────────────────────────────────────────

export interface HubSpotContactPayload {
  email?: string;
  firstname?: string;
  lastname?: string;
  jobtitle?: string;
  company?: string;
  linkedin_bio?: string;
  city?: string;
  state?: string;
  country?: string;
  website?: string;
  // Custom speaker fields
  speaker_overall_score?: number;
  speaker_topic_fit?: number;
  speaker_status?: string;
  speaker_event_name?: string;
  speaker_crm_note?: string;
}
