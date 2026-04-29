"use client";

import { useSession } from "@/lib/auth-client";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import DashboardNav from "@/components/DashboardNav";
import { useQuery } from "convex/react";
import {
  CalendarDays,
  LayoutDashboard,
  Mail,
  ShieldCheck,
  Ticket,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";

const primaryLink = {
  href: "/agent",
  label: "Agent",
  icon: Zap,
} as const satisfies {
  href: string;
  label: string;
  icon: LucideIcon;
};

const operationsLinks = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
  },
  {
    href: "/dashboard/events",
    label: "Events",
    icon: CalendarDays,
  },
  {
    href: "/dashboard/speakers",
    label: "Speakers",
    icon: Users,
  },
  {
    href: "/dashboard/communications",
    label: "Communications",
    icon: Mail,
  },
  {
    href: "/dashboard/invites",
    label: "Invites",
    icon: Ticket,
  },
  {
    href: "/dashboard/user-management",
    label: "User Management",
    icon: ShieldCheck,
  },
] as const satisfies ReadonlyArray<{
  href: string;
  label: string;
  icon: LucideIcon;
}>;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, isPending } = useSession();
  const member = useQuery(api.eboard.getCurrentMember);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isPending && !session) {
      const redirectPath = pathname || "/dashboard";
      router.replace(`/login?redirect=${encodeURIComponent(redirectPath)}`);
    }
  }, [isPending, pathname, router, session]);

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAFAFA]">
        <div className="text-center">
          <p className="text-[#6B6B6B]">Loading...</p>
        </div>
      </div>
    );
  }
  if (!session) return null;

  const isAdmin = member?.role === "admin";
  const visibleOperationsLinks = operationsLinks.filter((link) => {
    if (link.href === "/dashboard/invites" || link.href === "/dashboard/user-management") {
      return isAdmin;
    }
    return true;
  });

  const isLinkActive = (href: string) =>
    pathname === href ||
    (href !== "/dashboard" && href !== "/agent" && pathname.startsWith(href));

  return (
    <div className="flex h-screen bg-[#FAFAFA] text-[#111111]">
      <aside className="w-[272px] border-r border-[#EBEBEA] bg-[#FAFAFA]">
        <div className="flex h-full flex-col">
          <div className="flex h-[76px] items-center gap-3 border-b border-[#EBEBEB] px-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-[14px] bg-[#0A0A0A]">
              <div className="h-4 w-4 rounded-full border border-[#FFFFFF]/35 bg-[#0A0A0A]" />
            </div>
            <div>
              <div className="font-sans text-[14px] font-semibold tracking-[-0.02em] text-[#111111]">
                event.organizer
              </div>
              <div className="mt-0.5 text-[11px] uppercase tracking-[0.14em] text-[#A2A2A2]">
                Workspace
              </div>
            </div>
          </div>

          <nav className="flex-1 px-4 py-5">
            <div className="px-2 pb-3 font-sans text-[10px] font-semibold tracking-[0.14em] text-[#B3B3B3]">
              PRIMARY WORKSPACE
            </div>
            <Link
              href={primaryLink.href}
              className={`group flex min-h-[64px] items-center gap-3 rounded-[16px] border px-4 py-3 transition ${
                isLinkActive(primaryLink.href)
                  ? "border-[#D6D6D6] bg-[#111111] text-[#FFFFFF]"
                  : "border-[#E8E8E8] bg-[#FFFFFF] text-[#111111] hover:border-[#DADADA] hover:bg-[#F5F5F5]"
              }`}
            >
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-[12px] transition ${
                  isLinkActive(primaryLink.href)
                    ? "bg-[#FFFFFF]/10 text-[#FFFFFF]"
                    : "bg-[#F7F7F7] text-[#111111] group-hover:bg-[#FFFFFF]"
                }`}
              >
                <primaryLink.icon className="h-4 w-4" strokeWidth={2} />
              </div>
              <div className="min-w-0">
                <div className="text-[14px] font-semibold tracking-[-0.02em]">
                  {primaryLink.label}
                </div>
                <div
                  className={`mt-1 text-[12px] ${
                    isLinkActive(primaryLink.href) ? "text-[#D6D6D6]" : "text-[#7B7B7B]"
                  }`}
                >
                  Main workspace for active agent work
                </div>
              </div>
            </Link>

            <div className="mt-6 px-2 pb-3 font-sans text-[10px] font-semibold tracking-[0.14em] text-[#B3B3B3]">
              DASHBOARD TOOLS
            </div>
            <div className="space-y-1.5 rounded-[18px] border border-[#ECECEC] bg-[#FCFCFC] p-2">
              {visibleOperationsLinks.map((link) => {
                const active = isLinkActive(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`flex min-h-[42px] items-center gap-3 rounded-[12px] px-3 font-sans text-[13px] leading-none transition ${
                      active
                        ? "border border-[#D9D9D9] bg-[#FFFFFF] font-semibold text-[#0A0A0A]"
                        : "border border-transparent text-[#6F6F6F] hover:bg-[#F1F1F1] hover:text-[#1F1F1F]"
                    }`}
                  >
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-[10px] ${
                        active ? "bg-[#F4F4F4] text-[#111111]" : "text-[#7C7C7C]"
                      }`}
                    >
                      <link.icon className="h-4 w-4" strokeWidth={1.9} />
                    </div>
                    <span className="truncate">{link.label}</span>
                  </Link>
                );
              })}
            </div>
          </nav>

          <div className="border-t border-[#EBEBEA] bg-[#FAFAFA] px-4 py-4">
            <div className="rounded-[18px] border border-[#E8E8E8] bg-[#FFFFFF] px-4 py-3.5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#E5E5E5] bg-[#F7F7F7] text-[12px] font-semibold text-[#555555]">
                  {(session.user.name ?? session.user.email ?? "U")
                    .split(/\s+/)
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((part) => part[0]?.toUpperCase() ?? "")
                    .join("")}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-[#111111]">
                    {session.user.name}
                  </p>
                  <p className="mt-0.5 truncate text-[12px] text-[#7B7B7B]">
                    {session.user.email}
                  </p>
                </div>
              </div>

              <div className="mt-3 border-t border-[#EFEFEF] pt-3">
                <DashboardNav pathname={pathname} />
              </div>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-[#FFFFFF]">{children}</main>
    </div>
  );
}
