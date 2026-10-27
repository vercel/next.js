import { sampleIssues } from "../agent/lib/sample-issues";
import { Triage } from "./triage";

export default function Page() {
  return (
    <main>
      <header>
        <p className="eyebrow">Next.js + eve</p>
        <h1>Issue triage</h1>
        <p className="subtitle">
          The agent lives in <code>agent/</code> and is served from{" "}
          <code>/eve/v1/*</code> on this origin.
        </p>
      </header>
      <Triage issues={sampleIssues} />
    </main>
  );
}
