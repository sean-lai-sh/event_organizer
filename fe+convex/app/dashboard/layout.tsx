"use client";

import { useSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect } from "react";
import DashboardNav from "@/components/DashboardNav";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!session) {
      router.push("/login?redirect=/dashboard");
    }
  }, [session, router]);

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        <div className="text-center">
          <p className="text-zinc-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-zinc-50">
      {/* Sidebar */}
      <div className="w-64 border-r border-zinc-200 bg-white shadow-sm">
        <div className="flex flex-col h-full">
          {/* Logo/Header */}
          <div className="p-6 border-b border-zinc-200">
            <h1 className="text-xl font-bold text-zinc-900">Event Org</h1>
            <p className="text-xs text-zinc-500 mt-1">Eboard Dashboard</p>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-4 space-y-2">
            <Link
              href="/dashboard"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-zinc-700 hover:bg-blue-50 hover:text-blue-600 transition"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 12l2-3m0 0l7-4 7 4M5 9v10a1 1 0 001 1h12a1 1 0 001-1V9M9 21h6"
                />
              </svg>
              <span>Dashboard</span>
            </Link>

            <Link
              href="/dashboard/events"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-zinc-700 hover:bg-blue-50 hover:text-blue-600 transition"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h18M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <span>Events</span>
            </Link>

            <Link
              href="/dashboard/speakers"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-zinc-700 hover:bg-blue-50 hover:text-blue-600 transition"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4.354a4 4 0 110 5.292M15 21H3v-2a6 6 0 0112 0v2zm0 0h6v-2a6 6 0 00-9-5.656v5.656z"
                />
              </svg>
              <span>Speakers</span>
            </Link>

            <Link
              href="/dashboard/communications"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-zinc-700 hover:bg-blue-50 hover:text-blue-600 transition"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
              <span>Communications</span>
            </Link>
          </nav>

          {/* User Section */}
          <div className="border-t border-zinc-200 p-4">
            <div className="border-t-0 pt-0 mb-3 text-sm">
              <p className="font-medium text-zinc-900">{session.user.name}</p>
              <p className="text-xs text-zinc-500">{session.user.email}</p>
            </div>
            <DashboardNav />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-8">{children}</div>
      </div>
    </div>
  );
}
