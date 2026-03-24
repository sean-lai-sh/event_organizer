"use client";

import { signOut } from "@/lib/auth-client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function DashboardNav() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    await signOut({
      fetchOptions: {
        onSuccess: () => {
          router.push("/login");
        },
      },
    });
  }

  return (
    <div className="space-y-2">
      <Link
        href="/dashboard/account"
        className="flex h-10 items-center rounded-[8px] border border-[#E0E0E0] bg-[#FFFFFF] px-3 text-[13px] font-medium text-[#3B3B3B] transition hover:bg-[#F4F4F4]"
      >
        Manage Account
      </Link>
      <button
        onClick={handleLogout}
        disabled={loading}
        className="w-full rounded-[8px] px-3 py-2 text-left text-[12px] font-medium text-[#999999] transition hover:bg-[#F4F4F4] hover:text-[#555555] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Signing out..." : "Sign out"}
      </button>
    </div>
  );
}
