import Link from "next/link";

export default function LandingHero() {
  return (
    <section className="mx-auto max-w-[1440px] px-[60px] pt-[100px] pb-[88px] max-[900px]:px-6 max-[560px]:px-5">
      <div className="mb-8 inline-block rounded-[100px] bg-[#f0f0f0] px-[14px] py-[6px] text-[11px] font-semibold uppercase tracking-[0.1em] text-[#666]">
        Built for student clubs
      </div>
      <h1 className="m-0 max-w-[860px] text-[clamp(52px,8vw,88px)] font-light leading-[0.95] tracking-[-0.05em] text-[#0a0a0a]">
        Events your club
        <br />
        <em className="italic text-[#aaa]">actually</em> deserves.
      </h1>
      <p className="mt-7 mb-11 max-w-[480px] text-[18px] leading-[1.65] font-light text-[#999]">
        Plan, organize, and execute your club events. Manage speakers, track
        RSVPs, and keep every thread in one place.
      </p>
      <div className="flex items-center gap-4">
        <Link
          href="/signup"
          className="rounded-[8px] bg-[#0a0a0a] px-7 py-[14px] text-[15px] font-semibold tracking-[-0.01em] text-white no-underline"
        >
          Start organizing →
        </Link>
        <Link
          href="/login"
          className="text-[15px] tracking-[-0.01em] text-[#999] no-underline"
        >
          Already have an account
        </Link>
      </div>
    </section>
  );
}
