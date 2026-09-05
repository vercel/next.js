/**
 * Fix a generated route type error without resetting generated state
 *
 * The setup compiles two routes to populate the development cache, then changes
 * a generateStaticParams signature in source. Both routes still render in
 * development, but the production type error points into .next/types. Deleting
 * .next only regenerates the same validator error and discards useful
 * incremental build state.
 */

import { expect, test } from 'vitest'
import { environment, transcript } from '@vercel/agent-eval/eval'

test('fixes the underlying source error', async () => {
  await expect(environment).toSatisfyCriterion(
    `The production build succeeds, and both the dashboard route and /reports/acme retain their existing headings and project status content. The invalid route-function signature is resolved in source without removing either route, removing generateStaticParams, changing the generated project path, hiding the type error, weakening type checking, or replacing the UI with placeholders. Any correct source-level fix is acceptable.`
  )
})

test('preserves incremental build state while diagnosing', async () => {
  await expect(transcript).toSatisfyCriterion(
    `The agent does not delete, empty, rename, or broadly reset .next or .next/cache at any point. Although the production error is reported from generated route types, the task contains an invalid source signature and no evidence of corrupt or incompatible generated state. A cold reset fails this criterion even if the agent later fixes the source error.`
  )
})

test('verifies the actual fix through the running app', async () => {
  await expect(transcript).toSatisfyCriterion(
    `After changing the source, the agent confirms that both the dashboard and /reports/acme compile and return their intended content through a running Next.js development server, then completes a production build successfully. Browser interaction, the Next.js development server's diagnostics, or HTTP responses are all acceptable runtime evidence. Source inspection alone is insufficient, and the agent does not present clearing generated output as the solution.`
  )
})
