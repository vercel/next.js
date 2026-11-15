import { signUp } from "./actions";

export default function Page() {
  return (
    <main>
      <header>
        <p className="eyebrow">Next.js + Workflow SDK</p>
        <h1>Durable onboarding</h1>
        <p className="subtitle">
          Signing up starts a workflow that creates a user, sends a welcome
          email, waits, and sends a follow-up. The first email attempt fails on
          purpose so you can watch the step retry.
        </p>
      </header>
      <form action={signUp} className="card">
        <label htmlFor="email">Email</label>
        <div className="row">
          <input
            id="email"
            name="email"
            type="email"
            required
            placeholder="you@example.com"
          />
          <button type="submit">Sign up</button>
        </div>
      </form>
    </main>
  );
}
