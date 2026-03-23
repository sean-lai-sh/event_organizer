"use client";

import { useSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import DashboardNav from "@/components/DashboardNav";
import {
  CalendarDays,
  LayoutDashboard,
  Mail,
  Users,
  type LucideIcon,
} from "lucide-react";

const navLinks = [
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

  return (
    <div className="flex h-screen bg-[#FAFAFA] text-[#111111]">
      <aside className="w-64 border-r border-[#EBEBEA] bg-[#FAFAFA]">
        <div className="flex h-full flex-col">
          <div className="flex h-[72px] items-center gap-3 border-b border-[#EBEBEB] px-5">
            <div className="h-7 w-7 rounded-[12px] bg-[#0A0A0A]" />
            <div className="text-[14px] font-semibold tracking-[-0.02em] text-[#111111]">
              event.organizer
            </div>
          </div>

          <nav className="flex-1 px-4 py-4">
            <div className="px-2 pb-3 text-[10px] font-medium tracking-[0.08em] text-[#BBBBBB]">
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
                    className={`flex h-10 items-center gap-2 rounded-[8px] px-3 text-[13px] leading-none transition ${
                      active
                        ? "border border-[#CFCFCF] bg-[#EAEAEA] font-semibold text-[#0A0A0A]"
                        : "text-[#7B7B7B] hover:bg-[#EFEFEF] hover:text-[#1F1F1F]"
                    }`}
                  >
                    <link.icon className="h-4 w-4" strokeWidth={1.9} />
                    <span>{link.label}</span>
                  </Link>
                );
              })}
            </div>
          </nav>

          <div className="border-t border-[#EBEBEA] px-4 py-4">
            <div className="mb-3 border-b border-[#EBEBEB] pb-3 text-sm">
              <p className="text-[13px] font-medium text-[#111111]">{session.user.name}</p>
              <p className="text-[12px] text-[#7B7B7B]">{session.user.email}</p>
            </div>
            <DashboardNav />
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-[#FFFFFF]">{children}</main>
    </div>
  );
}
