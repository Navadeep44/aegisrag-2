import { ButtonLink } from "../components/ui/Button";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-start justify-center px-6">
      <h1 className="display text-6xl">This page does not exist.</h1>
      <p className="mt-4 text-lg text-muted">The address may be mistyped, or the page may have moved.</p>
      <ButtonLink to="/" size="lg" className="mt-8">Go to the home page</ButtonLink>
    </main>
  );
}
