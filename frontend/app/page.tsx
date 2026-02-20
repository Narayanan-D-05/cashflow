import Header from "@/components/header";
import HeroSection from "@/components/hero-section";
import FeaturesSection from "@/components/features-section";
import HowItWorks from "@/components/how-it-works";
import Footer from "@/components/footer";
import CursorGlow from "@/components/cursor-glow";

export default function Home() {
  return (
    <div className="relative min-h-screen flex flex-col">
      <CursorGlow />
      <Header />
      <main className="flex-1">
        <HeroSection />
        <FeaturesSection />
        <HowItWorks />
      </main>
      <Footer />
    </div>
  );
}
