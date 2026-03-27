import ArchitectureSection from "@/components/landing/ArchitectureSection";
import CtaSection from "@/components/landing/CtaSection";
import FeaturesSection from "@/components/landing/FeaturesSection";
import LandingFooter from "@/components/landing/LandingFooter";
import LandingHero from "@/components/landing/LandingHero";
import LandingNav from "@/components/landing/LandingNav";
import StatsSection from "@/components/landing/StatsSection";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#fafafa] text-[#0a0a0a] font-inter-var">
      <LandingNav />
      <LandingHero />
      <div className="border-t border-[#ebebeb]" />
      <FeaturesSection />
      <div className="border-t border-[#ebebeb]" />
      <ArchitectureSection />
      <StatsSection />
      <CtaSection />
      <div className="border-t border-[#ebebeb]" />
      <LandingFooter />
    </main>
  );
}
