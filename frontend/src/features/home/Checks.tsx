import { Reveal } from "../../components/motion/Reveal";
import { ButtonLink } from "../../components/ui/Button";

const CHECKS = [
  ["Revoked access", "Access is granted, a question is answered, access is revoked. The next question is refused and the earlier answer is withdrawn."],
  ["Another organization", "A user from a second company gets no content, no page previews and no admin actions on the first company's files."],
  ["Hidden instructions", "A PDF carries invisible text telling the model to reveal salaries. The text is removed at upload and flagged."],
  ["Invented citations", "An answer that cites a passage the model was never given is discarded instead of shown."],
  ["Forged identity", "Roles, clearance and organization sent in a request body are ignored. Identity comes from the server."],
  ["Guessed document links", "A made-up document id and a real restricted one return the same response."],
];

export function Checks() {
  return (
    <section id="checks" className="border-t border-line bg-surface">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <Reveal>
          <h2 className="display max-w-3xl text-[clamp(2.2rem,4.6vw,3.6rem)]">Security claims you can run, not just read.</h2>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
            The app ships with an attack suite. An administrator can run it from the Security page and see
            each result. Every test checks what reached the model, not only the wording of the answer.
          </p>
        </Reveal>
        <dl className="mt-14 grid gap-x-12 sm:grid-cols-2 lg:grid-cols-3">
          {CHECKS.map(([title, body], i) => (
            <Reveal key={title} delay={(i % 3) * 0.08} className="border-t border-line py-6">
              <dt className="display text-2xl">{title}</dt>
              <dd className="mt-2 text-[0.95rem] leading-relaxed text-muted">{body}</dd>
            </Reveal>
          ))}
        </dl>
        <Reveal className="mt-16 flex flex-wrap items-center justify-between gap-6 border-t border-ink pt-10">
          <p className="display max-w-xl text-[clamp(1.8rem,3.4vw,2.6rem)]">Sign in as five different people and ask the same question.</p>
          <ButtonLink to="/signin" size="lg">Open the demo</ButtonLink>
        </Reveal>
      </div>
    </section>
  );
}
