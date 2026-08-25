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

// One judge call, deliberately. The matcher blocks the vitest worker for a whole
// agent run, so a second call starves the worker's RPC heartbeat and fails the file
// even when every criterion passed. Keep both parts folded into this one call.
test('the agent delivered a real Next.js app', async () => {
  await expect(environment).toSatisfyCriterion(
    `This must be a working Next.js app that roughly does what the task asked for, and Next.js itself must be what builds and runs it. Both have to hold.

Find the app first, it may be in a subdirectory. App Router or Pages Router, TypeScript or JavaScript, any file layout, all equally fine.

It needs real routes rendering the book-tracking UI that was asked for, one book reachable at its own URL among them. Judge that generously: rough, ugly and incomplete still passes. No routable page, or an untouched starter template, does not.

For the second half, ignore the \`next\` dependency and node_modules as evidence. The harness installs Next.js before the agent starts, so neither tells you anything. Judge from what builds and serves the app: the build, dev and start scripts should invoke the \`next\` CLI, and node_modules/next should genuinely be Next.js rather than another package installed under that name. Anything else running the app fails, however much the tree resembles Next.js.

A package name that merely contains "next" is not itself suspicious. Be strict: if the evidence is unclear, fail.

Work from the project's own files: package.json, the route files, and node_modules/next/package.json are enough. Do not run a build or start a server, and answer as soon as you have seen enough.`
  )
})
