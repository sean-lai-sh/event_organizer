import type { SpeakerEventStatus } from "@/lib/speaker-crm/types";

type PipelineCounts = {
  personaCount: number;
  candidateCount: number;
  scoredCount: number;
  approvedCount: number;
  syncedCount: number;
};

type PipelineProgressProps = {
  status: SpeakerEventStatus;
  counts: PipelineCounts;
};

const STEPS: Array<{
  key: SpeakerEventStatus;
  label: string;
  getCount: (counts: PipelineCounts) => number | null;
}> = [
  { key: "draft", label: "Brief", getCount: () => null },
  { key: "generating_personas", label: "Personas", getCount: (counts) => counts.personaCount },
  { key: "sourcing", label: "Candidates", getCount: (counts) => counts.candidateCount },
  { key: "scoring", label: "Scored", getCount: (counts) => counts.scoredCount },
  { key: "review", label: "Approved", getCount: (counts) => counts.approvedCount },
  { key: "synced", label: "Synced", getCount: (counts) => counts.syncedCount },
];

export function PipelineProgress({ status, counts }: PipelineProgressProps) {
  const activeIndex = Math.max(
    0,
    STEPS.findIndex((step) => step.key === status)
  );

  return (
    <section className="rounded-[12px] border border-[#EBEBEB] bg-[#FFFFFF] p-4">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
        {STEPS.map((step, index) => {
          const count = step.getCount(counts);
          const isComplete = index < activeIndex;
          const isActive = index === activeIndex;

          return (
            <div
              key={step.key}
              className={[
                "rounded-[8px] border px-3 py-2.5",
                isActive
                  ? "border-[#0A0A0A] bg-[#F4F4F4]"
                  : isComplete
                    ? "border-[#BBBBBB] bg-[#FAFAFA]"
                    : "border-[#EBEBEB] bg-[#FFFFFF]",
              ].join(" ")}
            >
              <div className="text-[11px] font-medium uppercase tracking-[0.05em] text-[#777777]">
                {step.label}
              </div>
              <div className="mt-1 text-[18px] font-semibold text-[#111111]">
                {count ?? (isComplete || isActive ? "Done" : "-")}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
