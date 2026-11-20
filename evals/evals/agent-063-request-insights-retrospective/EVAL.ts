import { expect, test } from 'vitest'
import { transcript } from '@vercel/agent-eval/eval'

test('diagnoses the retained slow request without trial edits', async () => {
  await expect(transcript).toSatisfyCriterion(
    `Pass only when the transcript establishes every point:

- Evidence: it queries retained Request Insights data from the existing development session and ties its conclusion to the original slow /reports request with a request ID or an equally specific trace reference.
- Attribution: it identifies ResolveMetadata.generateMetadata, generateMetadata, or report metadata loading as the dominant interval and cites a duration of roughly 3.5 seconds.
- Alternatives: it uses trace timings to show that report-data fetching, instrumentation registration, compilation, and React rendering did not account for the multi-second delay.
- Profile decision: it states that this phase-level diagnosis does not require a CPU profile and explains why.
- Evidence preservation: after handoff, its transcript contains only read-only inspection of the existing project, process, and retained evidence. Ignore fixture preparation changes made before the transcript, including local Next.js installation changes to package.json, package-lock.json, tsconfig.json, and next.tgz, plus removal of eval-setup.mjs and its package script.

Fail when the conclusion rests only on source-code suspicion, when a new observation replaces the retained request, or when any required point is missing.`
  )
})
