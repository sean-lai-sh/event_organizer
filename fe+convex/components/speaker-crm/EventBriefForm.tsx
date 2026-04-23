"use client";

/**
 * EventBriefForm — Full event brief intake form.
 * Collects all fields needed to drive the speaker sourcing pipeline.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { parseTags } from "@/lib/speaker-crm/utils";
import type { SpeakerEventBrief, BudgetTier, SpeakerEventType } from "@/lib/speaker-crm/types";

interface EventBriefFormProps {
  onSubmit: (brief: SpeakerEventBrief) => Promise<void>;
  isSubmitting?: boolean;
}

const EVENT_TYPES: { value: SpeakerEventType; label: string }[] = [
  { value: "founder_fireside", label: "Founder Fireside" },
  { value: "growth_panel", label: "Growth Panel" },
  { value: "product_talk", label: "Product Talk" },
  { value: "workshop", label: "Workshop" },
  { value: "networking", label: "Networking" },
];

const BUDGET_TIERS: { value: BudgetTier; label: string; description: string }[] = [
  { value: "unpaid", label: "Unpaid / Volunteer", description: "Speaker contributes their time" },
  { value: "low", label: "Low ($0–$500)", description: "Honorarium or travel reimbursement" },
  { value: "medium", label: "Medium ($500–$3k)", description: "Professional speaker fee" },
  { value: "high", label: "High ($3k+)", description: "Top-tier keynote budget" },
];

export function EventBriefForm({ onSubmit, isSubmitting }: EventBriefFormProps) {
  const [form, setForm] = useState({
    name: "",
    eventType: "founder_fireside" as SpeakerEventType,
    description: "",
    audienceSummary: "",
    audienceSize: "100",
    locationCity: "",
    locationRegion: "",
    dateWindowStart: "",
    dateWindowEnd: "",
    themeTags: "",
    mustHaveTags: "",
    niceToHaveTags: "",
    exclusionTags: "",
    budgetTier: "unpaid" as BudgetTier,
    targetCandidateCount: "20",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate(): boolean {
    const newErrors: Record<string, string> = {};
    if (!form.name.trim()) newErrors.name = "Event name is required";
    if (!form.description.trim()) newErrors.description = "Description is required";
    if (!form.audienceSummary.trim()) newErrors.audienceSummary = "Audience summary is required";
    if (!form.locationCity.trim()) newErrors.locationCity = "City is required";
    if (!form.dateWindowStart) newErrors.dateWindowStart = "Start date is required";
    if (!form.dateWindowEnd) newErrors.dateWindowEnd = "End date is required";
    if (parseInt(form.audienceSize) < 1) newErrors.audienceSize = "Must be at least 1";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    const brief: SpeakerEventBrief = {
      name: form.name.trim(),
      eventType: form.eventType,
      description: form.description.trim(),
      audienceSummary: form.audienceSummary.trim(),
      audienceSize: parseInt(form.audienceSize),
      locationCity: form.locationCity.trim(),
      locationRegion: form.locationRegion.trim(),
      dateWindowStart: form.dateWindowStart,
      dateWindowEnd: form.dateWindowEnd,
      themeTags: parseTags(form.themeTags),
      mustHaveTags: parseTags(form.mustHaveTags),
      niceToHaveTags: parseTags(form.niceToHaveTags),
      exclusionTags: parseTags(form.exclusionTags),
      budgetTier: form.budgetTier,
      targetCandidateCount: parseInt(form.targetCandidateCount),
    };

    await onSubmit(brief);
  }

  function setField(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: "" }));
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic Info */}
      <section className="space-y-4 rounded-[12px] border border-[#EBEBEB] bg-[#FAFAFA] p-5">
        <h2 className="text-[12px] font-semibold tracking-[0.06em] text-[#6B6B6B] uppercase">
          Event Details
        </h2>

        <Field label="Event Name *" error={errors.name}>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setField("name", e.target.value)}
            placeholder="e.g. Spring Founder Fireside 2026"
            className={inputCls(!!errors.name)}
          />
        </Field>

        <Field label="Event Type *" error={errors.eventType}>
          <select
            value={form.eventType}
            onChange={(e) => setField("eventType", e.target.value)}
            className={inputCls(false)}
          >
            {EVENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Description *" error={errors.description}>
          <textarea
            value={form.description}
            onChange={(e) => setField("description", e.target.value)}
            placeholder="Describe the event format, goals, and what makes it special…"
            rows={3}
            className={inputCls(!!errors.description) + " resize-none"}
          />
        </Field>
      </section>

      {/* Audience */}
      <section className="space-y-4 rounded-[12px] border border-[#EBEBEB] bg-[#FAFAFA] p-5">
        <h2 className="text-[12px] font-semibold tracking-[0.06em] text-[#6B6B6B] uppercase">
          Audience
        </h2>

        <Field label="Audience Summary *" error={errors.audienceSummary}>
          <textarea
            value={form.audienceSummary}
            onChange={(e) => setField("audienceSummary", e.target.value)}
            placeholder="e.g. CS students and recent grads building their first startup, curious about fundraising and PMF…"
            rows={2}
            className={inputCls(!!errors.audienceSummary) + " resize-none"}
          />
        </Field>

        <Field label="Expected Attendance *" error={errors.audienceSize}>
          <input
            type="number"
            value={form.audienceSize}
            onChange={(e) => setField("audienceSize", e.target.value)}
            min={1}
            className={inputCls(!!errors.audienceSize) + " w-32"}
          />
        </Field>
      </section>

      {/* Location & Dates */}
      <section className="space-y-4 rounded-[12px] border border-[#EBEBEB] bg-[#FAFAFA] p-5">
        <h2 className="text-[12px] font-semibold tracking-[0.06em] text-[#6B6B6B] uppercase">
          Location & Dates
        </h2>

        <div className="grid grid-cols-2 gap-4">
          <Field label="City *" error={errors.locationCity}>
            <input
              type="text"
              value={form.locationCity}
              onChange={(e) => setField("locationCity", e.target.value)}
              placeholder="San Francisco"
              className={inputCls(!!errors.locationCity)}
            />
          </Field>
          <Field label="State / Region" error={errors.locationRegion}>
            <input
              type="text"
              value={form.locationRegion}
              onChange={(e) => setField("locationRegion", e.target.value)}
              placeholder="CA"
              className={inputCls(false)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Earliest Date *" error={errors.dateWindowStart}>
            <input
              type="date"
              value={form.dateWindowStart}
              onChange={(e) => setField("dateWindowStart", e.target.value)}
              className={inputCls(!!errors.dateWindowStart)}
            />
          </Field>
          <Field label="Latest Date *" error={errors.dateWindowEnd}>
            <input
              type="date"
              value={form.dateWindowEnd}
              onChange={(e) => setField("dateWindowEnd", e.target.value)}
              className={inputCls(!!errors.dateWindowEnd)}
            />
          </Field>
        </div>
      </section>

      {/* Tags */}
      <section className="space-y-4 rounded-[12px] border border-[#EBEBEB] bg-[#FAFAFA] p-5">
        <h2 className="text-[12px] font-semibold tracking-[0.06em] text-[#6B6B6B] uppercase">
          Speaker Criteria (comma-separated tags)
        </h2>

        <Field label="Theme Tags" hint="Topics the event covers, e.g. AI, fundraising, product">
          <input
            type="text"
            value={form.themeTags}
            onChange={(e) => setField("themeTags", e.target.value)}
            placeholder="AI, fundraising, B2B SaaS, product-led growth"
            className={inputCls(false)}
          />
        </Field>

        <Field
          label="Must-Have Speaker Qualities"
          hint="Requirements a speaker must meet"
        >
          <input
            type="text"
            value={form.mustHaveTags}
            onChange={(e) => setField("mustHaveTags", e.target.value)}
            placeholder="operator experience, student-friendly, startup background"
            className={inputCls(false)}
          />
        </Field>

        <Field label="Nice-to-Have" hint="Bonus qualities that improve fit">
          <input
            type="text"
            value={form.niceToHaveTags}
            onChange={(e) => setField("niceToHaveTags", e.target.value)}
            placeholder="Y Combinator alum, women in tech, technical background"
            className={inputCls(false)}
          />
        </Field>

        <Field label="Exclusions" hint="Types of speakers to avoid">
          <input
            type="text"
            value={form.exclusionTags}
            onChange={(e) => setField("exclusionTags", e.target.value)}
            placeholder="recruiter, sales-focused, non-startup"
            className={inputCls(false)}
          />
        </Field>
      </section>

      {/* Budget & Target */}
      <section className="space-y-4 rounded-[12px] border border-[#EBEBEB] bg-[#FAFAFA] p-5">
        <h2 className="text-[12px] font-semibold tracking-[0.06em] text-[#6B6B6B] uppercase">
          Budget & Sourcing
        </h2>

        <Field label="Budget Tier *">
          <div className="space-y-2">
            {BUDGET_TIERS.map((tier) => (
              <label
                key={tier.value}
                className={`flex cursor-pointer items-center gap-3 rounded-[8px] border p-3 transition ${
                  form.budgetTier === tier.value
                    ? "border-[#111111] bg-[#F4F4F4]"
                    : "border-[#E0E0E0] hover:bg-[#FAFAFA]"
                }`}
              >
                <input
                  type="radio"
                  name="budgetTier"
                  value={tier.value}
                  checked={form.budgetTier === tier.value}
                  onChange={(e) => setField("budgetTier", e.target.value)}
                  className="accent-[#111111]"
                />
                <div>
                  <p className="text-[13px] font-medium text-[#111111]">{tier.label}</p>
                  <p className="text-[12px] text-[#6B6B6B]">{tier.description}</p>
                </div>
              </label>
            ))}
          </div>
        </Field>

        <Field label="Target Number of Candidates" hint="How many candidates to source per run">
          <input
            type="number"
            value={form.targetCandidateCount}
            onChange={(e) => setField("targetCandidateCount", e.target.value)}
            min={5}
            max={200}
            className={inputCls(false) + " w-32"}
          />
        </Field>
      </section>

      <div className="flex justify-end gap-3 pb-6">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Creating event…" : "Create Event & Generate Personas"}
        </Button>
      </div>
    </form>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function inputCls(hasError: boolean): string {
  return `h-10 w-full rounded-[8px] border px-[14px] text-[14px] text-[#111111] outline-none transition focus:ring-2 focus:ring-[#111111]/10 ${
    hasError
      ? "border-red-400 focus:border-red-500"
      : "border-[#E0E0E0] bg-transparent focus:border-[#111111]"
  }`;
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[13px] font-medium text-[#3B3B3B]">{label}</label>
      {hint && <p className="text-[12px] text-[#9B9B9B]">{hint}</p>}
      {children}
      {error && <p className="text-[12px] text-red-500">{error}</p>}
    </div>
  );
}
