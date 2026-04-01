"use client";

import { useSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function AgentLayout({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!isPending && !session) {
      router.replace("/login?redirect=/agent");
    }
  }, [isPending, router, session]);

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAFAFA]">
        <p className="text-[13px] text-[#999999]">Loading…</p>
      </div>
    );
  }

  if (!session) return null;

  return <>{children}</>;
}
