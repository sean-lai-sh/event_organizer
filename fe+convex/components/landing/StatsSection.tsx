import { stats } from "@/components/landing/content";

export default function StatsSection() {
  return (
    <section className="bg-[#f4f4f4] px-[60px] py-[72px] max-[900px]:px-6 max-[560px]:px-5">
      <div className="mx-auto grid max-w-[1320px] grid-cols-4 gap-10 max-[900px]:grid-cols-2 max-[560px]:grid-cols-1">
        {stats.map((stat) => (
          <div key={stat.label}>
            <div className="mb-[6px] text-[clamp(32px,4vw,52px)] font-light tracking-[-0.05em] text-[#0a0a0a]">
              {stat.num}
            </div>
            <div className="text-[14px] text-[#aaa]">{stat.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
