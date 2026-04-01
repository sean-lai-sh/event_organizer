"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { FlaskConical } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";

export function AttendanceDemoSeed({
  triggerLabel = "Load demo data",
  triggerVariant = "outline",
}: {
  triggerLabel?: string;
  triggerVariant?: "default" | "outline" | "secondary" | "ghost";
}) {
  const seedDemoData = useMutation(api.attendance.seedDemoData);
  const [isSeeding, setIsSeeding] = useState(false);

  async function handleSeed() {
    try {
      setIsSeeding(true);
      const result = await seedDemoData({});
      const message =
        result.events_created > 0 || result.attendance_imported > 0 || result.insights_created > 0
          ? `Loaded ${result.events_created} demo events, ${result.attendance_imported} attendance rows, and ${result.insights_created} insights.`
          : "Demo attendance data already exists.";
      toast.success(message);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load demo attendance data";
      toast.error(message);
    } finally {
      setIsSeeding(false);
    }
  }

  return (
    <Button
      type="button"
      variant={triggerVariant}
      onClick={handleSeed}
      disabled={isSeeding}
      className="gap-2 transition-transform duration-[120ms] ease-out active:scale-[0.97]"
    >
      <FlaskConical className="h-3.5 w-3.5" />
      {isSeeding ? "Loading…" : triggerLabel}
    </Button>
  );
}
