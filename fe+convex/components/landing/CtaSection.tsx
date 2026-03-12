import Link from "next/link";

export default function CtaSection() {
  return (
    <section className="mx-auto flex max-w-[1440px] items-end justify-between gap-10 px-[60px] py-[110px] max-[900px]:flex-col max-[900px]:items-start max-[900px]:px-6 max-[560px]:px-5">
      <h2 className="m-0 max-w-[620px] text-[clamp(40px,6vw,68px)] font-light leading-[0.97] tracking-[-0.05em] text-[#0a0a0a]">
        Ready to run
        <br />
        your next
        <br />
        club event?
      </h2>
      <div className="flex flex-col items-end gap-3 max-[900px]:items-start">
        <Link
          href="/signup"
          className="whitespace-nowrap rounded-[8px] bg-[#0a0a0a] px-8 py-4 text-[15px] font-semibold tracking-[-0.01em] text-white no-underline"
        >
          Create free account →
        </Link>
        <span className="text-[13px] text-[#bbb]">No credit card required</span>
      </div>
    </section>
  );
}
