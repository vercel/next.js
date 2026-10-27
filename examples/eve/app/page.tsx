import { sampleIssues } from "../agent/lib/sample-issues";
import { Triage } from "./triage";

export default function Page() {
  return (
    <main>
      <h1>Next.js + eve</h1>
      <p className="subtitle">
        An issue triage agent. A decision model classifies every issue, and only
        the unsure ones go to a reviewer subagent. The agent lives in{" "}
        <code>agent/</code> and is served from <code>/eve/v1/*</code> on this
        origin.
      </p>
      <Triage issues={sampleIssues} />
    </main>
  );
}
