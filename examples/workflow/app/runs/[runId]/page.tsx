import Link from "next/link";
import { RunProgress } from "./run-progress";

export default async function RunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;

  return (
    <main>
      <header>
        <p className="eyebrow">Workflow run</p>
        <h1>Onboarding</h1>
        <p className="subtitle mono">{runId}</p>
      </header>
      <RunProgress runId={runId} />
      <p className="hint">
        Reload this page or close the tab: the run keeps going, and the page
        replays its progress when you come back. Run{" "}
        <code>npx workflow web</code> to inspect every step and retry.
      </p>
      <Link href="/">Start another run</Link>
    </main>
  );
}
