import { Reveal } from "../../components/motion/Reveal";
import { ButtonLink } from "../../components/ui/Button";
import { ShieldAlert, Building2, EyeOff, FileQuestion, UserX, Link2Off } from "lucide-react";

const CHECKS = [
  {
    title: "Revoked access", 
    body: "Access is granted, a question is answered, access is revoked. The next question is refused and the earlier answer is withdrawn.",
    icon: <ShieldAlert className="h-6 w-6 text-warn" />
  },
  {
    title: "Another organization", 
    body: "A user from a second company gets no content, no page previews and no admin actions on the first company's files.",
    icon: <Building2 className="h-6 w-6 text-ink" />
  },
  {
    title: "Hidden instructions", 
    body: "A PDF carries invisible text telling the model to reveal salaries. The text is removed at upload and flagged.",
    icon: <EyeOff className="h-6 w-6 text-ink" />
  },
  {
    title: "Invented citations", 
    body: "An answer that cites a passage the model was never given is discarded instead of shown.",
    icon: <FileQuestion className="h-6 w-6 text-ink" />
  },
  {
    title: "Forged identity", 
    body: "Roles, clearance and organization sent in a request body are ignored. Identity comes from the server.",
    icon: <UserX className="h-6 w-6 text-deny" />
  },
  {
    title: "Guessed document links", 
    body: "A made-up document id and a real restricted one return the same response.",
    icon: <Link2Off className="h-6 w-6 text-ink" />
  },
];

export function Checks() {
  return (
    <section id="checks" className="border-t border-line bg-surface">
      <div className="mx-auto max-w-6xl px-6 py-28">
        <Reveal>
          <div className="flex flex-col items-center text-center">
            <h2 className="display max-w-3xl text-[clamp(2.5rem,5vw,4rem)] text-ink leading-tight">Security claims you can run, not just read.</h2>
            <p className="mt-6 max-w-2xl text-xl leading-relaxed text-muted">
              The app ships with an attack suite. An administrator can run it from the Security page and see
              each result. Every test checks what reached the model, not only the wording of the answer.
            </p>
          </div>
        </Reveal>
        
        <dl className="mt-20 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {CHECKS.map((check, i) => (
            <Reveal key={check.title} delay={(i % 3) * 0.1}>
              <div className="group h-full rounded-3xl border border-line bg-surface-subtle p-8 transition-all hover:scale-[1.02] hover:bg-surface hover:shadow-md">
                <div className="mb-6 inline-flex rounded-xl bg-surface p-3 shadow-sm group-hover:bg-accent/5">
                  {check.icon}
                </div>
                <dt className="display text-2xl text-ink">{check.title}</dt>
                <dd className="mt-3 text-[1.05rem] leading-relaxed text-muted">{check.body}</dd>
              </div>
            </Reveal>
          ))}
        </dl>

        <Reveal delay={0.2} className="mt-24 rounded-3xl bg-ink px-8 py-12 text-center shadow-lg sm:px-16">
          <div className="mx-auto max-w-2xl">
            <p className="display text-[clamp(2rem,4vw,3rem)] text-white leading-tight">
              Sign in as five different people and ask the same question.
            </p>
            <div className="mt-10 flex justify-center">
              <ButtonLink to="/signin" size="lg" className="bg-white text-ink hover:bg-surface-subtle hover:text-ink px-10 py-4 text-lg">
                Open the demo
              </ButtonLink>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
