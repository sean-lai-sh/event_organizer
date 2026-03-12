import { features } from "@/components/landing/content";

export default function FeaturesSection() {
  return (
    <section className="mx-auto max-w-[1440px] px-[60px] pt-[88px] pb-[88px] max-[900px]:px-6 max-[560px]:px-5">
      <p className="mb-14 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#bbb]">
        Everything you need
      </p>
      <div className="grid grid-cols-3 gap-[1px] overflow-hidden rounded-[12px] border border-[#ebebeb] bg-[#ebebeb] max-[900px]:grid-cols-2 max-[560px]:grid-cols-1">
        {features.map((feature) => (
          <div key={feature.label} className="bg-[#fafafa] px-9 py-11">
            <div className="mb-6 h-2 w-2 rounded-full bg-[#0a0a0a]" />
            <h3 className="mt-0 mb-[10px] text-[17px] font-semibold tracking-[-0.03em] text-[#0a0a0a]">
              {feature.label}
            </h3>
            <p className="m-0 text-[14px] leading-[1.7] font-light text-[#999]">
              {feature.desc}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
