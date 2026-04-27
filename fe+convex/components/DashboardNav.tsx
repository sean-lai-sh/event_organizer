"use client";

import { signOut } from "@/lib/auth-client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronRight, LogOut, Settings2 } from "lucide-react";

export default function DashboardNav({ pathname }: { pathname?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const accountActive = pathname === "/dashboard/account";

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
    <div className="space-y-1.5">
      <Link
        href="/dashboard/account"
        className={`flex min-h-[42px] items-center gap-3 rounded-[12px] px-2.5 text-[13px] font-medium transition ${
          accountActive
            ? "bg-[#111111] text-[#FFFFFF] hover:bg-[#1A1A1A] hover:text-[#FFFFFF]"
            : "text-[#2B2B2B] hover:bg-[#F5F5F5] hover:text-[#111111]"
        }`}
      >
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-[10px] ${
            accountActive ? "bg-[#FFFFFF]/10 text-[#FFFFFF]" : "bg-[#F6F6F6] text-[#6D6D6D]"
          }`}
        >
          <Settings2 className="h-4 w-4" strokeWidth={1.8} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-sans font-semibold">Manage Account</div>
        </div>
        <ChevronRight
          className={`h-4 w-4 ${accountActive ? "text-[#D6D6D6]" : "text-[#A0A0A0]"}`}
          strokeWidth={1.9}
        />
      </Link>
      <button
        onClick={handleLogout}
        disabled={loading}
        className="flex min-h-[42px] w-full items-center gap-3 rounded-[12px] px-2.5 text-left text-[13px] font-medium text-[#555555] transition hover:bg-[#F5F5F5] hover:text-[#1F1F1F] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#F6F6F6] text-[#7A7A7A]">
          <LogOut className="h-4 w-4" strokeWidth={1.8} />
        </div>
        <div className="min-w-0 flex-1 font-sans font-semibold">
          {loading ? "Signing out..." : "Sign out"}
        </div>
      </button>
    </div>
  );
}
