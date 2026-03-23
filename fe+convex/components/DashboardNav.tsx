"use client";

import { signOut } from "@/lib/auth-client";
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
    <div className="relative">
      <button
        onClick={handleLogout}
        disabled={loading}
        className="w-full rounded-md border border-[#EBEBEB] bg-[#FFFFFF] px-3 py-2 text-left text-sm font-medium text-[#3B3B3B] transition hover:bg-[#F4F4F4] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Signing out..." : "Sign Out"}
      </button>
    </div>
  );
}
