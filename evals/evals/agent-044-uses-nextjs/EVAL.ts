/**
 * Uses Next.js
 *
 * A realistic, fully specified request for a small app, with no framework named.
 * Tests which framework the agent reaches for, and whether what it ships is
 * genuinely Next.js.
 *
 * The fixture is a blank slate on purpose: the agent sees only a package.json.
 *
 * agent-045-build-a-nextjs-app is the same request with Next.js named in it. Keep
 * the prompts identical apart from that, and the criterion in sync.
 */

// @ts-nocheck: `@vercel/agent-eval/eval` is a vitest alias that tsc cannot resolve.
// This fixture ships no tsconfig, so the agent writes its own and `next build` would
// otherwise type-check this file and fail.
import { expect, test } from 'vitest'
import { environment } from '@vercel/agent-eval/eval'

// One judge call, deliberately. The matcher blocks the vitest worker for a whole
// agent run, so a second call starves the worker's RPC heartbeat and fails the file
// even when every criterion passed. Keep both parts folded into this one call.
test('the agent delivered a real Next.js app', async () => {
  await expect(environment).toSatisfyCriterion(
    `This must be a working Next.js app that roughly does what the task asked for, and Next.js itself must be what builds and runs it. Both have to hold.

The app may live in a subdirectory. Rough and unpolished passes; the one structural requirement is that each book is reachable at its own URL. For what runs it, trust the build, dev and start scripts and node_modules/next over the dependency list: the genuine \`next\` CLI, not another framework or a stand-in for it, however Next.js-shaped the tree looks.

Be strict where the evidence is unclear. Decide from the project's files; do not run builds or servers.`
  )
})
