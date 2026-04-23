/**
 * Speaker CRM — Prompt library.
 *
 * All LLM prompts are defined here as typed functions that return
 * { system, user } pairs. Schemas are defined inline with Zod and
 * validated at runtime. Prompt versions are tracked so scores can
 * be audited later.
 *
 * Rules enforced in every prompt:
 * - Do NOT invent facts. If evidence is missing, say so.
 * - Missing evidence should reduce score AND confidence.
 * - Return JSON only — no prose, no markdown fences.
 * - Be concise and structured.
 */

import { z } from "zod";
import type { SpeakerEventBrief, SpeakerPersona, CandidateProfile } from "./types";

// ─── Prompt versions ──────────────────────────────────────────────────────────
// Bump these whenever the prompt text changes so scores stay auditable.

export const PROMPT_VERSIONS = {
  persona_generation: "v1.0",
  search_strategy: "v1.0",
  candidate_scoring: "v1.0",
  crm_note: "v1.0",
  feedback_normalization: "v1.0",
} as const;

// ─── 1. Persona Generation ────────────────────────────────────────────────────

export const PersonaGenerationOutputSchema = z.object({
  personas: z.array(
    z.object({
      label: z.string().min(1).describe("Short archetype label, e.g. 'Early-stage Founder'"),
      description: z
        .string()
        .min(10)
        .describe("2-3 sentence profile of this speaker type and why they fit"),
      searchTitles: z
        .array(z.string())
        .min(1)
        .max(6)
        .describe("Job title keywords to search for this persona on Apollo/LinkedIn"),
      searchKeywords: z
        .array(z.string())
        .min(1)
        .max(8)
        .describe("Domain or topic keywords for this persona"),
      searchLocations: z
        .array(z.string())
        .describe("Target city/region strings for Apollo search"),
      searchCompanyTypes: z
        .array(z.string())
        .describe("Company types, e.g. 'early-stage startup', 'Series A', 'VC-backed'"),
      priority: z
        .number()
        .int()
        .min(1)
        .max(10)
        .describe("Fit priority 1=highest for this event"),
    })
  ).min(5).max(8),
});

export type PersonaGenerationOutput = z.infer<typeof PersonaGenerationOutputSchema>;

export function buildPersonaGenerationPrompt(brief: SpeakerEventBrief): {
  system: string;
  user: string;
} {
  return {
    system: `You are a speaker sourcing expert for student and startup-focused events.
Your job is to generate 5–8 distinct speaker persona archetypes that would be excellent fits for the given event brief.

Rules:
- Each persona must be realistic and sourced from real professional archetypes.
- Do NOT invent companies or people.
- Focus on FIT over FAME — a relevant operator with strong audience relevance beats a famous name with weak fit.
- searchTitles and searchKeywords must be precise enough to use in Apollo/LinkedIn people search.
- Return ONLY valid JSON matching the schema. No markdown, no prose.`,

    user: `Event brief:
Name: ${brief.name}
Type: ${brief.eventType}
Description: ${brief.description}
Audience: ${brief.audienceSummary} (~${brief.audienceSize} attendees)
Location: ${brief.locationCity}, ${brief.locationRegion}
Dates: ${brief.dateWindowStart} to ${brief.dateWindowEnd}
Theme tags: ${brief.themeTags.join(", ")}
Must-have speaker qualities: ${brief.mustHaveTags.join(", ")}
Nice-to-have: ${brief.niceToHaveTags.join(", ")}
Exclusions: ${brief.exclusionTags.join(", ")}
Budget: ${brief.budgetTier}
Target candidates: ${brief.targetCandidateCount}

Generate 5–8 speaker persona archetypes. Return JSON with structure:
{
  "personas": [
    {
      "label": "...",
      "description": "...",
      "searchTitles": [...],
      "searchKeywords": [...],
      "searchLocations": [...],
      "searchCompanyTypes": [...],
      "priority": 1
    }
  ]
}`,
  };
}

// ─── 2. Search Strategy Generation ───────────────────────────────────────────

export const SearchStrategyOutputSchema = z.object({
  strategies: z.array(
    z.object({
      personaLabel: z.string(),
      queries: z.array(
        z.object({
          queryDescription: z.string(),
          titleKeywords: z.array(z.string()),
          booleanKeywords: z.string().optional(),
          locations: z.array(z.string()),
          companyTypes: z.array(z.string()),
          seniority: z.array(z.string()),
          estimatedResultQuality: z.enum(["high", "medium", "low"]),
        })
      ).min(1).max(3),
    })
  ),
});

export type SearchStrategyOutput = z.infer<typeof SearchStrategyOutputSchema>;

export function buildSearchStrategyPrompt(
  brief: SpeakerEventBrief,
  personas: SpeakerPersona[]
): { system: string; user: string } {
  return {
    system: `You are a speaker sourcing researcher. Given an event brief and speaker personas,
generate precise Apollo/LinkedIn search strategies for each persona.

Rules:
- Queries must be specific enough to yield 10–50 high-quality results per run.
- Use real seniority levels: founder, c_suite, vp, director, manager, individual_contributor.
- Return ONLY valid JSON. No markdown, no prose.`,

    user: `Event: ${brief.name} (${brief.eventType})
Audience: ${brief.audienceSummary}
Location: ${brief.locationCity}, ${brief.locationRegion}
Must-have tags: ${brief.mustHaveTags.join(", ")}

Personas:
${personas
  .map(
    (p) => `- ${p.label}: ${p.description}
  Titles: ${p.searchTitles.join(", ")}
  Keywords: ${p.searchKeywords.join(", ")}`
  )
  .join("\n")}

For each persona, generate 1–3 Apollo search strategies. Return JSON:
{
  "strategies": [
    {
      "personaLabel": "...",
      "queries": [
        {
          "queryDescription": "...",
          "titleKeywords": [...],
          "booleanKeywords": "optional AND/OR string",
          "locations": [...],
          "companyTypes": [...],
          "seniority": [...],
          "estimatedResultQuality": "high" | "medium" | "low"
        }
      ]
    }
  ]
}`,
  };
}

// ─── 3. Candidate Scoring ─────────────────────────────────────────────────────

export const CandidateScoringOutputSchema = z.object({
  topicFit: z.number().min(0).max(10),
  audienceFit: z.number().min(0).max(10),
  credibility: z.number().min(0).max(10),
  speakingFit: z.number().min(0).max(10),
  accessibility: z.number().min(0).max(10),
  brandPull: z.number().min(0).max(10),
  locationFit: z.number().min(0).max(10),
  budgetFit: z.number().min(0).max(10),
  overallScore: z.number().min(0).max(10),
  confidence: z.number().min(0).max(1),
  strengths: z.array(z.string()).min(1).max(5),
  concerns: z.array(z.string()).max(5),
  evidence: z.record(z.string(), z.array(z.string())),
  rationale: z.string().min(20).max(500),
});

export type CandidateScoringOutput = z.infer<typeof CandidateScoringOutputSchema>;

export function buildCandidateScoringPrompt(
  brief: SpeakerEventBrief,
  persona: SpeakerPersona | null,
  candidate: CandidateProfile
): { system: string; user: string } {
  return {
    system: `You are a speaker fit evaluator for student and startup events.
Score this candidate against the event brief on 8 dimensions (0–10 each).

Scoring rules:
- Do NOT assign a high score without supporting evidence.
- If a field is missing or unknown, lower both the relevant dimension score AND the confidence.
- FIT matters more than fame — a highly relevant operator outscores a famous name with weak relevance.
- accessibility reflects booking likelihood: a busy celebrity with no student event history should score low.
- budgetFit: unpaid=10 means they speak free or for small stipend; high budget means they charge $10k+.
- overallScore must equal the weighted average:
  topicFit×0.22 + audienceFit×0.18 + credibility×0.15 + speakingFit×0.12
  + accessibility×0.10 + brandPull×0.10 + locationFit×0.08 + budgetFit×0.05
- confidence: 0.9+ only with strong direct evidence; drop to 0.4–0.6 if profile is sparse.
- Return ONLY valid JSON. No markdown, no explanation outside the JSON.`,

    user: `Event brief:
Name: ${brief.name}
Type: ${brief.eventType}
Audience: ${brief.audienceSummary} (~${brief.audienceSize} attendees)
Location: ${brief.locationCity}, ${brief.locationRegion}
Must-have: ${brief.mustHaveTags.join(", ")}
Nice-to-have: ${brief.niceToHaveTags.join(", ")}
Exclusions: ${brief.exclusionTags.join(", ")}
Budget tier: ${brief.budgetTier}
${persona ? `Target persona: ${persona.label} — ${persona.description}` : ""}

Candidate profile:
Name: ${candidate.fullName}
Title: ${candidate.currentTitle ?? "unknown"}
Company: ${candidate.companyName ?? "unknown"}
Location: ${candidate.city ?? ""}, ${candidate.region ?? ""}, ${candidate.country ?? ""}
LinkedIn: ${candidate.linkedinUrl ?? "not available"}
Bio: ${candidate.bio ?? "not available"}
Speaking evidence: ${candidate.publicSpeakingEvidence ?? "none found"}
Topic tags: ${candidate.topicTags.join(", ") || "none"}
Industry tags: ${candidate.industryTags.join(", ") || "none"}

Score this candidate. Return JSON:
{
  "topicFit": 0-10,
  "audienceFit": 0-10,
  "credibility": 0-10,
  "speakingFit": 0-10,
  "accessibility": 0-10,
  "brandPull": 0-10,
  "locationFit": 0-10,
  "budgetFit": 0-10,
  "overallScore": 0-10,
  "confidence": 0-1,
  "strengths": ["...", "..."],
  "concerns": ["...", "..."],
  "evidence": { "topicFit": ["..."], "credibility": ["..."] },
  "rationale": "2-4 sentence summary of fit"
}`,
  };
}

// ─── 4. CRM Note Generation ───────────────────────────────────────────────────

export const CRMNoteOutputSchema = z.object({
  note: z.string().min(50).max(600),
});

export type CRMNoteOutput = z.infer<typeof CRMNoteOutputSchema>;

export function buildCRMNotePrompt(
  brief: SpeakerEventBrief,
  candidate: CandidateProfile,
  score: {
    overallScore: number;
    confidence: number;
    strengths: string[];
    concerns: string[];
    rationale: string;
  }
): { system: string; user: string } {
  return {
    system: `You are a CRM note writer for an event team.
Write a concise internal note about this speaker candidate for the team's CRM.
The note should help a teammate quickly understand who this person is, why they fit, and what to watch out for.

Rules:
- 3–5 sentences maximum.
- Do not exaggerate fit or invent facts.
- Mention the event name and overall score.
- Flag concerns clearly.
- Return ONLY valid JSON: { "note": "..." }`,

    user: `Event: ${brief.name} (${brief.eventType})
Candidate: ${candidate.fullName}, ${candidate.currentTitle ?? "unknown title"} at ${candidate.companyName ?? "unknown company"}
Overall score: ${score.overallScore.toFixed(1)}/10 (confidence: ${Math.round(score.confidence * 100)}%)
Strengths: ${score.strengths.join("; ")}
Concerns: ${score.concerns.join("; ")}
Rationale: ${score.rationale}

Write an internal CRM note. Return: { "note": "..." }`,
  };
}

// ─── 5. Feedback Normalization ────────────────────────────────────────────────

export const FeedbackNormalizationOutputSchema = z.object({
  normalizedLabel: z.enum(["quality", "relevance", "booking_ease", "communication", "other"]),
  value: z.enum(["positive", "negative", "neutral"]),
  summary: z.string().max(200),
});

export type FeedbackNormalizationOutput = z.infer<typeof FeedbackNormalizationOutputSchema>;

export function buildFeedbackNormalizationPrompt(rawFeedback: string): {
  system: string;
  user: string;
} {
  return {
    system: `You classify free-text feedback about speaker candidates into structured labels.
Return ONLY valid JSON: { "normalizedLabel": "...", "value": "...", "summary": "..." }`,

    user: `Feedback text: "${rawFeedback}"

Classify into:
- normalizedLabel: quality | relevance | booking_ease | communication | other
- value: positive | negative | neutral
- summary: one-sentence paraphrase

Return JSON only.`,
  };
}
