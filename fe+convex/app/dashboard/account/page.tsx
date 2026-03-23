"use client";

import { useSession } from "@/lib/auth-client";
import { DashboardPageShell } from "@/components/dashboard/PageShell";

function Field({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[12px] font-medium uppercase tracking-[0.08em] text-[#999999]">
        {label}
      </label>
      <div className="h-11 rounded-[8px] border border-[#E0E0E0] bg-[#FFFFFF] px-[14px] text-[14px] leading-[42px] text-[#111111]">
        {value}
      </div>
    </div>
  );
}

export default function AccountPage() {
  const { data: session } = useSession();

  return (
    <DashboardPageShell
      title="Account"
    >
      <section className="max-w-[560px] rounded-[14px] border border-[#EBEBEB] bg-[#FFFFFF] p-5">
        <h2 className="text-[16px] font-semibold text-[#111111]">Profile</h2>
        <p className="mt-1 text-[13px] text-[#999999]">
          These values come from your authenticated account.
        </p>

        <div className="mt-5 space-y-4">
          <Field label="Name" value={session?.user.name ?? "—"} />
          <Field label="Email" value={session?.user.email ?? "—"} />
        </div>
      </section>
    </DashboardPageShell>
  );
}
