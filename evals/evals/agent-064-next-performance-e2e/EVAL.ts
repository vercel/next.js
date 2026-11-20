import { expect, test } from 'vitest'
import { transcript } from '@vercel/agent-eval/eval'

test('correlates the existing e2e flow without retaining edits', async () => {
  await expect(transcript).toSatisfyCriterion(
    `Pass only when the transcript establishes every point:

- Existing flow: it runs tests/reports.spec.ts with the existing Playwright command rather than replacing the test or inventing another flow.
- Browser evidence: it collects and inspects Playwright trace, network, or browser timing evidence from that run.
- Server evidence: it queries Request Insights and ties the /reports navigation to a retained request ID or equally specific trace reference.
- Attribution: it identifies report metadata loading as the dominant interval at roughly 3.5 seconds and distinguishes it from the report-data request, compilation, and React rendering.
- Output: it ranks the measured problem and proposes at least one relevant fix with a verification plan, without implementing the fix.
- Cleanup: after handoff, the transcript shows no retained application or test edits. Temporary diagnostic instrumentation is acceptable only when restored before reporting. Ignore fixture setup changes made before the transcript, including local dependency installation and removal of eval-setup.mjs.

Fail when the conclusion rests only on source inspection, when it omits either browser or retained server evidence, or when it leaves diagnostic or application changes behind.`
  )
})
