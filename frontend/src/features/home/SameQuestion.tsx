import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useLayoutEffect, useRef } from "react";
import { Reveal } from "../../components/motion/Reveal";
import { Banded, Level } from "../../components/ui/Classification";
import { User, Lock, FileX } from "lucide-react";

gsap.registerPlugin(ScrollTrigger);

const QUESTION = "What was our annual revenue?";

function Asker({ name, detail, Icon }: { name: string; detail: string; Icon: any }) {
  return (
    <div className="flex items-center gap-4 border-b border-line pb-4">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-subtle text-ink shadow-sm">
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <p className="display text-2xl text-ink">{name}</p>
        <p className="text-sm font-medium text-muted">{detail}</p>
      </div>
    </div>
  );
}

export function SameQuestion() {
  const root = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      const ctx = gsap.context(() => {
        gsap.from("[data-card]", {
          y: 40,
          opacity: 0,
          duration: 0.8,
          stagger: 0.2,
          ease: "power3.out",
          scrollTrigger: { trigger: "[data-card-container]", start: "top 80%" },
        });
      }, root);
      return () => ctx.revert();
    });
    return () => media.revert();
  }, []);

  return (
    <section id="same-question" ref={root} className="border-t border-line bg-surface">
      <div className="mx-auto max-w-6xl px-6 py-28">
        <Reveal>
          <div className="max-w-3xl">
            <h2 className="display text-[clamp(2.5rem,5vw,4rem)] text-ink leading-tight">
              One question, two people, two different answers.
            </h2>
            <p className="mt-6 text-xl leading-relaxed text-muted">
              The revenue report is confidential and granted to Finance. The permission check runs before the
              search, so for anyone else the report is never found, ranked or shown to the model.
            </p>
          </div>
        </Reveal>

        <div data-card-container className="mt-16 grid gap-8 md:grid-cols-2">
          <div data-card className="rounded-3xl border border-line bg-surface p-8 shadow-sm transition-shadow hover:shadow-md">
            <Asker name="Farid, Finance" detail="Confidential clearance" Icon={Lock} />
            <div className="mt-8 flex flex-col gap-4">
              <div className="self-end rounded-2xl rounded-tr-sm bg-ink px-5 py-3 text-white shadow-sm">
                <p>{QUESTION}</p>
              </div>
              <div className="self-start rounded-2xl rounded-tl-sm border border-line bg-surface-subtle px-5 py-4 shadow-sm">
                <p className="leading-relaxed text-ink">
                  Total annual revenue for FY2025 was $48.2 million, up 12% from $43.0 million in FY2024.
                </p>
              </div>
            </div>
            <Banded level={2} className="mt-6 rounded-xl px-5 py-4">
              <Level level={2} />
              <p className="mt-2 text-sm font-medium text-ink">FY2025 Revenue Report, page 1</p>
              <p className="text-sm text-muted">The cited passage, shown beside the answer.</p>
            </Banded>
          </div>

          <div data-card className="rounded-3xl border border-line bg-surface p-8 shadow-sm transition-shadow hover:shadow-md">
            <Asker name="Emil, Employee" detail="Internal clearance" Icon={User} />
            <div className="mt-8 flex flex-col gap-4">
              <div className="self-end rounded-2xl rounded-tr-sm bg-ink px-5 py-3 text-white shadow-sm">
                <p>{QUESTION}</p>
              </div>
              <div className="self-start rounded-2xl rounded-tl-sm border border-dashed border-muted bg-surface-subtle px-5 py-4 shadow-sm">
                <div className="flex items-center gap-2 font-medium text-ink">
                  <FileX className="h-5 w-5 text-muted" />
                  No authorized source
                </div>
                <p className="mt-1 text-muted">I couldn't find an authorized source for that information.</p>
              </div>
            </div>
            <div className="mt-6 rounded-xl bg-page px-5 py-4">
              <p className="text-sm leading-relaxed text-muted">
                The reply is the same whether the document is restricted or does not exist, so it gives nothing away.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
