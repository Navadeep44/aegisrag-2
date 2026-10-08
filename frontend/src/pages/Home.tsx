import { Footer } from "../components/layout/Footer";
import { PublicNav } from "../components/layout/PublicNav";
import { Checks } from "../features/home/Checks";
import { Hero } from "../features/home/Hero";
import { HowItWorks } from "../features/home/HowItWorks";
import { SameQuestion } from "../features/home/SameQuestion";
import { PinnedSteps } from "../components/motion/PinnedSteps";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-page text-ink selection:bg-accent/15 selection:text-accent">
      <PublicNav />
      <main className="flex-1">
        <Hero />
        <SameQuestion />
        <section id="architecture" className="border-t border-line bg-page py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-6">
            <PinnedSteps />
          </div>
        </section>
        <HowItWorks />
        <Checks />
      </main>
      <Footer />
    </div>
  );
}


