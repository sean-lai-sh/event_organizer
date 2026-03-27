import type { ReactNode } from "react";

export function DashboardPageShell({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-full bg-[#FFFFFF] font-[var(--font-geist-sans)]">
      <header className="sticky top-0 z-20 border-b border-[#EBEBEB] bg-[#FFFFFF]/95 backdrop-blur-sm">
        <div className="flex h-[72px] items-center justify-between gap-3 px-7">
          <div className="min-w-0 pr-4">
            <h1 className="text-lg font-semibold leading-6 tracking-[-0.01em] text-[#0A0A0A]">
              {title}
            </h1>
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      </header>

      <div className="px-7 py-4">
        <div className="space-y-5">{children}</div>
      </div>
    </div>
  );
}
