import ExplodedArchitectureView from "@/components/landing/ExplodedArchitectureView";
import { platformLeft, platformRight } from "@/components/landing/content";

export default function ArchitectureSection() {
  return (
    <section className="border-b border-[#ebebeb] bg-[#f8f8f8] px-[60px] py-[100px] max-[900px]:px-6 max-[560px]:px-5">
      <div className="mx-auto max-w-[1320px]">
        <div className="mb-[72px] text-center">
          <p className="mt-0 mb-4 text-[17px] font-normal tracking-[-0.5px] text-[#6b6b6b]">
            Architecture
          </p>
          <h2 className="mx-auto mb-[18px] mt-0 max-w-[620px] font-sans text-[clamp(36px,4vw,48px)] font-light leading-[1.05] tracking-[-2.4px] text-[#393939]">
            A platform built to connect everything your club needs.
          </h2>
          <p className="mx-auto m-0 max-w-[500px] text-[20px] leading-[1.6] font-normal tracking-[-0.35px] text-[#6b6b6b]">
            A shared foundation that keeps your events, outreach, and alumni
            data in sync automatically.
          </p>
        </div>

        <div className="flex min-h-[560px] items-stretch justify-center gap-15 max-[1240px]:gap-[30px] max-[1024px]:min-h-0 max-[1024px]:flex-col max-[1024px]:items-center max-[1024px]:gap-5">
          <div className="flex w-[240px] flex-col justify-between pt-[30px] pb-[126px] max-[1024px]:w-full max-[1024px]:max-w-[560px] max-[1024px]:justify-start max-[1024px]:gap-[18px] max-[1024px]:p-0">
            {platformLeft.map((item) => (
              <article key={item.title} className="flex flex-col gap-[6px]">
                <h3 className="m-0 text-[16px] leading-[1.25] font-light tracking-[-1px] text-black">
                  {item.title}
                </h3>
                <p className="m-0 text-[14px] leading-[1.6] font-light text-black">
                  {item.desc}
                </p>
              </article>
            ))}
          </div>

          <ExplodedArchitectureView />

          <div className="flex w-[240px] flex-col justify-between pt-[157px] pb-0 max-[1024px]:w-full max-[1024px]:max-w-[560px] max-[1024px]:justify-start max-[1024px]:gap-[18px] max-[1024px]:p-0">
            {platformRight.map((item) => (
              <article key={item.title} className="flex flex-col gap-[6px]">
                <h3 className="m-0 text-[16px] leading-[1.25] font-light tracking-[-1px] text-black">
                  {item.title}
                </h3>
                <p className="m-0 text-[14px] leading-[1.6] font-light text-black">
                  {item.desc}
                </p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
