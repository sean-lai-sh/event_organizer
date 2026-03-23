"use client";

import { useSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import DashboardNav from "@/components/DashboardNav";

const navLinks = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 12l2-3m0 0l7-4 7 4M5 9v10a1 1 0 001 1h12a1 1 0 001-1V9M9 21h6"
      />
    ),
  },
  {
    href: "/dashboard/events",
    label: "Events",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 7V3m8 4V3m-9 8h18M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    ),
  },
  {
    href: "/dashboard/speakers",
    label: "Speakers",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 4.354a4 4 0 110 5.292M15 21H3v-2a6 6 0 0112 0v2zm0 0h6v-2a6 6 0 00-9-5.656v5.656z"
      />
    ),
  },
  {
    href: "/dashboard/communications",
    label: "Communications",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
      />
    ),
  },
] as const;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!session) {
      router.push("/login?redirect=/dashboard");
    }
  }, [session, router]);

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAFAFA]">
        <div className="text-center">
          <p className="text-[#6B6B6B]">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#FAFAFA] text-[#111111]">
      <aside className="w-60 border-r border-[#EBEBEA] bg-[#FAFAFA]">
        <div className="flex h-full flex-col">
          <div className="flex h-16 items-center gap-3 border-b border-[#EBEBEB] px-5">
            <div className="h-7 w-7 rounded-xl bg-[#0A0A0A]" />
            <div className="text-[13px] font-semibold">event.organizer</div>
          </div>

          <nav className="flex-1 p-3">
            <div className="px-2 pb-2 text-[10px] font-medium tracking-[0.08em] text-[#BBBBBB]">
              NAVIGATION
            </div>
            <div className="space-y-1">
              {navLinks.map((link) => {
                const active =
                  pathname === link.href ||
                  (link.href !== "/dashboard" && pathname.startsWith(link.href));
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`flex h-9 items-center gap-2 rounded-md px-3 text-[13px] transition ${
                      active
                        ? "border-l-2 border-[#0A0A0A] bg-[#F4F4F4] font-semibold text-[#3B3B3B]"
                        : "text-[#7B7B7B] hover:bg-[#F4F4F4]"
                    }`}
                  >
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      {link.icon}
                    </svg>
                    <span>{link.label}</span>
                  </Link>
                );
              })}
            </div>
          </nav>

          <div className="border-t border-[#EBEBEA] px-4 py-3">
            <div className="mb-3 text-sm">
              <p className="font-medium text-[#111111]">{session.user.name}</p>
              <p className="text-xs text-[#7B7B7B]">{session.user.email}</p>
            </div>
            <DashboardNav />
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-[#FFFFFF] p-6">{children}</main>
    </div>
  );
}
