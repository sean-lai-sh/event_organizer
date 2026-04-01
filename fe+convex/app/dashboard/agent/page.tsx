"use client";

import { DashboardPageShell } from "@/components/dashboard/PageShell";

export default function AgentPage() {
  return (
    <DashboardPageShell title="Agent">
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-[15px] font-medium text-[#111111]">Coming soon</p>
        <p className="mt-1 text-[13px] text-[#999999]">
          Chat with an AI agent about your attendance data.
        </p>
      </div>
    </DashboardPageShell>
  );
}
