import { Reveal } from "../../components/motion/Reveal";
import { Banded, Level } from "../../components/ui/Classification";

const QUESTION = "What was our annual revenue?";

function Asker({ name, detail }: { name: string; detail: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line pb-4">
      <p className="display text-2xl">{name}</p>
      <p className="text-sm text-muted">{detail}</p>
    </div>
  );
}

export function SameQuestion() {
  return (
    <section id="same-question" className="border-t border-line bg-surface">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <Reveal>
          <h2 className="display max-w-3xl text-[clamp(2.2rem,4.6vw,3.6rem)]">One question, two people, two different answers.</h2>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
            The revenue report is confidential and granted to Finance. The permission check runs before the
            search, so for anyone else the report is never found, ranked or shown to the model.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-10 md:grid-cols-2">
          <Reveal delay={0.05}>
            <Asker name="Farid, Finance" detail="Confidential clearance" />
            <p className="ml-auto mt-6 w-fit rounded-md bg-ink px-3.5 py-2 text-sm text-white">{QUESTION}</p>
            <p className="mt-4 rounded-md border border-line bg-page px-4 py-3 leading-relaxed">
              Total annual revenue for FY2025 was $48.2 million, up 12% from $43.0 million in FY2024.
            </p>
            <Banded level={2} className="mt-3 px-4 py-3">
              <Level level={2} />
              <p className="text-sm font-medium">FY2025 Revenue Report, page 1</p>
              <p className="text-sm text-muted">The cited passage, shown beside the answer.</p>
            </Banded>
          </Reveal>

          <Reveal delay={0.18}>
            <Asker name="Emil, Employee" detail="Internal clearance" />
            <p className="ml-auto mt-6 w-fit rounded-md bg-ink px-3.5 py-2 text-sm text-white">{QUESTION}</p>
            <div className="mt-4 rounded-md border border-dashed border-muted px-4 py-3 leading-relaxed">
              <p className="font-medium">No authorized source</p>
              <p className="text-muted">I couldn't find an authorized source for that information.</p>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              The reply is the same whether the document is restricted or does not exist, so it gives nothing away.
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
