import { Footer } from "../components/layout/Footer";
import { PublicNav } from "../components/layout/PublicNav";
import { Checks } from "../features/home/Checks";
import { Hero } from "../features/home/Hero";
import { HowItWorks } from "../features/home/HowItWorks";
import { SameQuestion } from "../features/home/SameQuestion";
import { PinnedSteps } from "../components/motion/PinnedSteps";

export default function Home() {
  return (
    <>
      <PublicNav />
      <main>
        <Hero />
        <SameQuestion />
        <section className="mx-auto max-w-6xl px-6 py-12">
          <PinnedSteps />
        </section>
        <HowItWorks />
        <Checks />
      </main>
      <Footer />
    </>
  );
}

