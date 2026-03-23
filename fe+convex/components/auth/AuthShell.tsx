import type { ReactNode } from "react";

export function AuthShell({
  children,
  title,
  subtitle,
  footnote,
}: {
  children: ReactNode;
  title: string;
  subtitle: string;
  footnote: string;
}) {
  return (
    <div className="auth-root flex min-h-screen bg-[#FAFAFA] text-[#111111]">
      <div className="hidden flex-1 bg-gradient-to-b from-[#FAFAFA] to-[#F0F0F0] lg:flex">
        <div className="flex w-full flex-col justify-between p-[60px]">
          <span className="font-[var(--font-geist-sans)] text-[18px] font-semibold tracking-[-0.04em] text-[#0A0A0A]">
            eventclub
          </span>

          <div className="max-w-[520px]">
            <h1 className="text-[76px] font-light leading-[0.97] tracking-[-3.2px] text-[#0A0A0A]">
              {title}
            </h1>
            <p className="mt-5 max-w-[420px] text-[14px] text-[#999999]">{subtitle}</p>
          </div>

          <p className="text-[12px] text-[#999999]">{footnote}</p>
        </div>
      </div>

      <div className="flex w-full items-center justify-center bg-[#FFFFFF] px-6 py-10 lg:w-[480px] lg:px-[60px]">
        <div className="w-full max-w-[360px]">{children}</div>
      </div>
    </div>
  );
}
