import { Footer } from "../components/layout/Footer";
import { PublicNav } from "../components/layout/PublicNav";
import { Checks } from "../features/home/Checks";
import { Hero } from "../features/home/Hero";
import { HowItWorks } from "../features/home/HowItWorks";
import { SameQuestion } from "../features/home/SameQuestion";

export default function Home() {
  return (
    <>
      <PublicNav />
      <main>
        <Hero />
        <SameQuestion />
        <HowItWorks />
        <Checks />
      </main>
      <Footer />
    </>
  );
}
