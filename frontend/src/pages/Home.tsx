import { Footer } from "../components/layout/Footer";
import { PublicNav } from "../components/layout/PublicNav";
import { Capabilities, GetStarted } from "../features/home/Capabilities";
import { Formats } from "../features/home/Formats";
import { Hero } from "../features/home/Hero";
import { Pipeline } from "../features/home/Pipeline";
import { SameQuestion } from "../features/home/SameQuestion";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col text-ink">
      <PublicNav />
      <main className="flex-1">
        <Hero />
        <Formats />
        <Pipeline />
        <SameQuestion />
        <Capabilities />
        <GetStarted />
      </main>
      <Footer />
    </div>
  );
}
