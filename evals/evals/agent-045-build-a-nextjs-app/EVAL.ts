/**
 * Build a Next.js app
 *
 * The same request as agent-044-uses-nextjs with Next.js named in it. That eval
 * asks which framework an agent reaches for; this one asks whether an agent told
 * to use Next.js actually delivers it.
 *
 * The fixture is a blank slate on purpose: the agent sees only a package.json.
 *
 * Keep the prompts identical apart from the framework mention, and the criterion
 * in sync.
 */

// @ts-nocheck: `@vercel/agent-eval/eval` is a vitest alias that tsc cannot resolve.
// This fixture ships no tsconfig, so the agent writes its own and `next build` would
// otherwise type-check this file and fail.
import { expect, test } from 'vitest'
import { environment } from '@vercel/agent-eval/eval'

// A judge call runs a whole agent in the sandbox; one call keeps the eval cheap.
test('the agent used Next.js', async () => {
  await expect(environment).toSatisfyCriterion(
    `Next.js must be what this project actually uses: the genuine \`next\` CLI is what builds and runs it, not another framework or a stand-in for it, however Next.js-shaped the tree looks. Nothing else about the app matters here.

Trust the build, dev and start scripts and node_modules/next over the dependency list. The app may live in a subdirectory. Be strict where the evidence is unclear. Decide from the project's files; do not run builds or servers.`
  )
})
