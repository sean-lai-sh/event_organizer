"use client";

/**
 * CandidateDetail — right-panel detail view for a selected candidate.
 * Shows profile, score breakdown, review controls.
 */

import { ScoreBreakdown } from "./ScoreBreakdown";
import { ReviewControls } from "./ReviewControls";
import type {
  CandidateProfileWithId,
  CandidateScoreWithId,
  ReviewDecision,
  ReviewDecisionRecord,
  SpeakerPersonaWithId,
} from "@/lib/speaker-crm/types";

interface CandidateDetailProps {
  eventCandidateId: string;
  profile: CandidateProfileWithId;
  score?: CandidateScoreWithId;
  review?: ReviewDecisionRecord;
  persona?: SpeakerPersonaWithId;
  onReview: (
    ecId: string,
    decision: ReviewDecision,
    reasonCodes: string[],
    notes: string
  ) => Promise<void>;
}

export function CandidateDetail({
  eventCandidateId,
  profile,
  score,
  review,
  persona,
  onReview,
}: CandidateDetailProps) {
  return (
    <div className="space-y-5">
      {/* Profile header */}
      <div>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-[18px] font-bold text-[#111111]">{profile.fullName}</h2>
            {(profile.currentTitle || profile.companyName) && (
              <p className="text-[13px] text-[#555555]">
                {profile.currentTitle}
                {profile.currentTitle && profile.companyName ? " at " : ""}
                {profile.companyName}
              </p>
            )}
            {(profile.city || profile.region) && (
              <p className="text-[12px] text-[#9B9B9B]">
                {[profile.city, profile.region, profile.country].filter(Boolean).join(", ")}
              </p>
            )}
          </div>
        </div>

        {/* Links */}
        <div className="mt-2 flex flex-wrap gap-3">
          {profile.linkedinUrl && (
            <a
              href={profile.linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[12px] text-blue-600 hover:underline"
            >
              LinkedIn →
            </a>
          )}
          {profile.websiteUrl && (
            <a
              href={profile.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[12px] text-blue-600 hover:underline"
            >
              Website →
            </a>
          )}
          {profile.email && (
            <span className="text-[12px] text-[#6B6B6B]">{profile.email}</span>
          )}
        </div>
      </div>

      {/* Persona match */}
      {persona && (
        <div className="rounded-[8px] border border-[#E0E0E0] bg-[#FAFAFA] px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#6B6B6B]">
            Matched Persona
          </p>
          <p className="text-[13px] font-medium text-[#111111]">{persona.label}</p>
          <p className="text-[12px] text-[#555555]">{persona.description}</p>
        </div>
      )}

      {/* Bio */}
      {profile.bio && (
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-[#6B6B6B]">
            Bio
          </p>
          <p className="text-[13px] leading-relaxed text-[#3B3B3B]">{profile.bio}</p>
        </div>
      )}

      {/* Speaking evidence */}
      {profile.publicSpeakingEvidence && (
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-[#6B6B6B]">
            Speaking Evidence
          </p>
          <p className="text-[13px] leading-relaxed text-[#3B3B3B]">
            {profile.publicSpeakingEvidence}
          </p>
        </div>
      )}

      {/* Tags */}
      {(profile.topicTags.length > 0 ||
        profile.industryTags.length > 0 ||
        profile.audienceTags.length > 0) && (
        <div className="space-y-2">
          {profile.topicTags.length > 0 && (
            <TagRow label="Topics" tags={profile.topicTags} />
          )}
          {profile.industryTags.length > 0 && (
            <TagRow label="Industry" tags={profile.industryTags} />
          )}
          {profile.audienceTags.length > 0 && (
            <TagRow label="Audience" tags={profile.audienceTags} />
          )}
        </div>
      )}

      <div className="border-t border-[#EBEBEB]" />

      {/* Score breakdown */}
      {score ? (
        <ScoreBreakdown score={score} />
      ) : (
        <div className="rounded-[8px] bg-[#F8F8F8] p-4 text-center text-[13px] text-[#9B9B9B]">
          Not yet scored
        </div>
      )}

      <div className="border-t border-[#EBEBEB]" />

      {/* Review */}
      <ReviewControls
        eventCandidateId={eventCandidateId}
        currentDecision={review?.decision as ReviewDecision | undefined}
        currentNotes={review?.reviewerNotes}
        onSubmit={onReview}
      />
    </div>
  );
}

function TagRow({ label, tags }: { label: string; tags: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] font-medium text-[#9B9B9B]">{label}:</span>
      {tags.map((tag) => (
        <span
          key={tag}
          className="rounded-full border border-[#E0E0E0] bg-[#F8F8F8] px-2 py-0.5 text-[11px] text-[#555555]"
        >
          {tag}
        </span>
      ))}
    </div>
  );
}
