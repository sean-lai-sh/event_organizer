/**
 * Speaker CRM — Scoring service.
 *
 * Computes the weighted overall score from dimension scores.
 * Also used to validate LLM output (the model should produce overallScore
 * matching the formula, but we recalculate it server-side for integrity).
 */

import { SCORE_WEIGHTS, type ScoreDimensions } from "./types";

/** Recalculate overallScore from dimension scores using the canonical weights */
export function computeWeightedScore(dims: ScoreDimensions): number {
  const raw =
    dims.topicFit * SCORE_WEIGHTS.topicFit +
    dims.audienceFit * SCORE_WEIGHTS.audienceFit +
    dims.credibility * SCORE_WEIGHTS.credibility +
    dims.speakingFit * SCORE_WEIGHTS.speakingFit +
    dims.accessibility * SCORE_WEIGHTS.accessibility +
    dims.brandPull * SCORE_WEIGHTS.brandPull +
    dims.locationFit * SCORE_WEIGHTS.locationFit +
    dims.budgetFit * SCORE_WEIGHTS.budgetFit;

  // Round to 2 decimal places
  return Math.round(raw * 100) / 100;
}

/**
 * Clamp a model-provided confidence based on data quality signals.
 * If key profile fields are missing, cap confidence regardless of model output.
 */
export function clampConfidence(
  modelConfidence: number,
  hasBio: boolean,
  hasSpeakingEvidence: boolean,
  hasLinkedIn: boolean
): number {
  let cap = 0.95;

  if (!hasBio && !hasSpeakingEvidence) cap = Math.min(cap, 0.5);
  else if (!hasBio || !hasSpeakingEvidence) cap = Math.min(cap, 0.7);

  if (!hasLinkedIn) cap = Math.min(cap, 0.65);

  return Math.min(modelConfidence, cap);
}

/** Map an overall score to a display tier */
export function scoreTierLabel(score: number): string {
  if (score >= 7.5) return "Top Pick";
  if (score >= 6.0) return "Good Fit";
  if (score >= 4.5) return "Maybe";
  return "Pass";
}

/** Color class for a score tier (Tailwind) */
export function scoreTierColor(score: number): string {
  if (score >= 7.5) return "text-emerald-600 bg-emerald-50 border-emerald-200";
  if (score >= 6.0) return "text-blue-600 bg-blue-50 border-blue-200";
  if (score >= 4.5) return "text-amber-600 bg-amber-50 border-amber-200";
  return "text-red-500 bg-red-50 border-red-200";
}

/** Confidence tier label */
export function confidenceTierLabel(confidence: number): string {
  if (confidence >= 0.8) return "High";
  if (confidence >= 0.55) return "Medium";
  return "Low";
}

/** All 8 dimension keys in display order */
export const SCORE_DIMENSION_LABELS: Array<{
  key: keyof ScoreDimensions;
  label: string;
  weight: number;
}> = [
  { key: "topicFit", label: "Topic Fit", weight: SCORE_WEIGHTS.topicFit },
  { key: "audienceFit", label: "Audience Fit", weight: SCORE_WEIGHTS.audienceFit },
  { key: "credibility", label: "Credibility", weight: SCORE_WEIGHTS.credibility },
  { key: "speakingFit", label: "Speaking Fit", weight: SCORE_WEIGHTS.speakingFit },
  { key: "accessibility", label: "Accessibility", weight: SCORE_WEIGHTS.accessibility },
  { key: "brandPull", label: "Brand Pull", weight: SCORE_WEIGHTS.brandPull },
  { key: "locationFit", label: "Location Fit", weight: SCORE_WEIGHTS.locationFit },
  { key: "budgetFit", label: "Budget Fit", weight: SCORE_WEIGHTS.budgetFit },
];
