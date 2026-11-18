import { sampleIssues } from "../agent/lib/sample-issues";
import { Triage } from "./triage";

export default function Page() {
  return (
    <main>
      <header>
        <p className="eyebrow">Next.js + eve</p>
        <h1>Issue triage</h1>
        <p className="subtitle">
          A decision model triages every issue. Only the unsure ones go to a
          reviewer agent.
        </p>
      </header>
      <Triage issues={sampleIssues} />
    </main>
  );
}
