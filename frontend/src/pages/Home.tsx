import { Footer } from "../components/layout/Footer";
import { PublicNav } from "../components/layout/PublicNav";
import { Hero } from "../features/home/Hero";
import { SameQuestion } from "../features/home/SameQuestion";
import { Modalities, PipelineStrip, Proof } from "../features/home/Sections";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col text-ink">
      <PublicNav />
      <main className="flex-1">
        <Hero />
        <PipelineStrip />
        <SameQuestion />
        <Modalities />
        <Proof />
      </main>
      <Footer />
    </div>
  );
}
