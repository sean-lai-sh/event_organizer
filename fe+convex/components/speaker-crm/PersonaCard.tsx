"use client";

/**
 * PersonaCard — displays a single speaker persona archetype.
 */

import type { SpeakerPersonaWithId } from "@/lib/speaker-crm/types";

interface PersonaCardProps {
  persona: SpeakerPersonaWithId;
}

export function PersonaCard({ persona }: PersonaCardProps) {
  return (
    <div className="rounded-[10px] border border-[#EBEBEB] bg-[#FFFFFF] p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[14px] font-semibold text-[#111111]">{persona.label}</h3>
        <span className="rounded-full bg-[#F0F0F0] px-2 py-0.5 text-[10px] font-medium text-[#6B6B6B]">
          Priority {persona.priority}
        </span>
      </div>

      <p className="mb-3 text-[12px] leading-relaxed text-[#555555]">{persona.description}</p>

      <div className="space-y-2">
        {persona.searchTitles.length > 0 && (
          <TagRow label="Titles" tags={persona.searchTitles} />
        )}
        {persona.searchKeywords.length > 0 && (
          <TagRow label="Keywords" tags={persona.searchKeywords} />
        )}
        {persona.searchLocations.length > 0 && (
          <TagRow label="Locations" tags={persona.searchLocations} />
        )}
        {persona.searchCompanyTypes.length > 0 && (
          <TagRow label="Company Types" tags={persona.searchCompanyTypes} />
        )}
      </div>
    </div>
  );
}

function TagRow({ label, tags }: { label: string; tags: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.05em] text-[#AAAAAA]">
        {label}:
      </span>
      {tags.slice(0, 5).map((tag) => (
        <span
          key={tag}
          className="rounded-full border border-[#E8E8E8] bg-[#F8F8F8] px-2 py-0.5 text-[11px] text-[#3B3B3B]"
        >
          {tag}
        </span>
      ))}
      {tags.length > 5 && (
        <span className="text-[11px] text-[#AAAAAA]">+{tags.length - 5}</span>
      )}
    </div>
  );
}
