import Link from "next/link";

export default function LandingNav() {
  return (
    <nav className="sticky top-0 z-50 flex items-center justify-between 
    
    bg-[#fafafafd] px-[60px] py-[14px] max-[900px]:px-6 max-[560px]:px-5">
      <span className="text-[18px] font-bold tracking-[-0.04em] text-[#0a0a0a]">
        eventclub
      </span>
      <div className="flex items-center gap-7">
        <Link href="/login" className="text-[14px] text-[#666] no-underline">
          Sign in
        </Link>
        <Link
          href="/signup"
          className="rounded-md bg-[#0a0a0a]px-5 py-2.5 text-[14px] font-semibold tracking-[-0.01em] text-white no-underline"
        >
          Get started
        </Link>
      </div>
    </nav>
  );
}
