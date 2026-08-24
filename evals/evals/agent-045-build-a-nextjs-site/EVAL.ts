/**
 * Build a Next.js site
 *
 * Prompt: "Build a Next.js site." The framework is named this time, so the
 * question is no longer whether the agent picks Next.js. It is whether an agent
 * told to use Next.js actually delivers Next.js, on a blank slate, with nothing
 * to copy from.
 *
 * The fixture is a blank slate on purpose. The agent sees exactly one file: a
 * package.json with a placeholder build script and vitest (so this file can run).
 * No app/, no next.config, no react.
 *
 * The sibling eval agent-044-uses-nextjs runs the identical criterion against the
 * unqualified prompt "Build an app." Read together they separate two failures
 * that look the same on a dashboard: never reaching for Next.js, and reaching for
 * it but shipping something that only resembles it. A pass here with a fail there
 * is the interesting result. Keep the two in sync. They are duplicated rather
 * than shared because the harness withholds only PROMPT.md and EVAL.ts from the
 * agent, so a common helper module would be readable by the agent under test.
 *
 * Judged rather than pattern-matched, for two reasons:
 *
 * - The interesting failure is open-ended. A drop-in replacement for the next CLI
 *   keeps the App Router tree and the `next/*` imports and swaps only the command
 *   that builds and serves the app, so every structural signal still fires. Any
 *   list of such packages is a snapshot that goes stale the day a new one ships;
 *   the criterion below describes the category instead.
 * - The shape of a correct answer is not fixed. The agent may scaffold in place or
 *   into a subdirectory, use the App Router or the Pages Router, TypeScript or
 *   JavaScript, route groups, a src/ directory. Enumerating those in code is a
 *   pile of special cases that a judge handles by just reading the tree.
 *
 * The one thing the judge must be told: the harness installs Next.js into the
 * fixture before the agent starts, so a `next` dependency is not evidence of
 * anything and the criterion says so explicitly.
 */

// @ts-nocheck: `@vercel/agent-eval/eval` is an alias the harness registers in the
// generated vitest config, so it does not resolve for tsc. Other fixtures dodge
// this by excluding EVAL.ts in their tsconfig, but this one ships no tsconfig on
// purpose (see above) and the agent writes its own, which sweeps this file into
// `next build`'s type check and fails the build. Suppressing here keeps the
// fixture a blank slate.
import { expect, test } from 'vitest'
import { environment } from '@vercel/agent-eval/eval'

// ONE judge call, deliberately. Every criterion below is folded into a single
// toSatisfyCriterion because the matcher blocks the vitest worker with spawnSync
// while a whole agent run happens inside it. Two sequential calls starve the
// worker's RPC heartbeat, and vitest fails the file with an unhandled
// `Timeout calling "onTaskUpdate"` even when both criteria pass. Every other
// judged fixture in this suite makes exactly one call for the same reason.
// Splitting this up will turn the eval red for reasons unrelated to the model.
test('the agent delivered a real Next.js app', async () => {
  await expect(environment).toSatisfyCriterion(
    `This project must be a working Next.js application that renders a page, and Next.js itself must be what builds and runs it. Both halves have to hold. If either fails, the whole criterion fails.

FIRST, find the app. It may have been scaffolded directly in this directory or into a subdirectory. All of these are equally correct and none of them counts against it: TypeScript or JavaScript, the App Router or the Pages Router, route groups, a src/ directory, any directory name.

PART 1 — it is a real, rendering Next.js app.
Look for Next.js's own routing conventions: an App Router tree (an app/ directory with a root layout and at least one page) or a Pages Router tree (a pages/ directory with an index route). The entry route must be a component that actually renders UI, not an empty placeholder, a stub returning null, or a file that only exports metadata.

Fails part 1: there is no routable page at all; the directory is still the empty starting fixture; the agent built a command line program, a bare HTTP server with no UI, or a plain static HTML page with no Next.js routing.

PART 2 — Next.js itself builds and runs it.
Important: this eval's harness installs the genuine \`next\` package into the project BEFORE the agent starts. So \`next\` appearing in package.json dependencies, or a real Next.js sitting in node_modules, proves nothing about what the agent did. Do not treat either as evidence.

Gather evidence from what actually runs the app:
- The build, dev and start scripts in the app's package.json. Which command do they invoke? A Next.js app is built and served by the \`next\` CLI.
- Whether node_modules/next is genuinely Next.js: its package.json name is exactly "next" and it exposes a \`next\` binary. A dependency entry can point somewhere else, for example "next": "npm:some-other-package@1", which installs a different package under the name \`next\`.
- Whether any dependency or import is a package that imitates Next.js or substitutes for it.

Fails part 2:
- Another framework or toolchain builds the app: Vite, Nuxt, Remix, Astro, Gatsby, SvelteKit, Qwik, a bare bundler, a plain HTTP server.
- A drop-in replacement for the \`next\` CLI runs the app. This is the hard case and the main reason this criterion exists. Such a package deliberately accepts Next.js file conventions and \`next/*\` imports, so app/page.tsx, next.config and the imports all look completely normal, and it swaps only the command that builds and serves the project. The file tree looks like Next.js while Next.js is not running it. The scripts are where this shows up, so read them carefully and ask whether the command they run is the \`next\` CLI itself or something standing in for it.
- The \`next\` dependency is aliased to a different package, or a lookalike package is used in place of Next.js.

Passes part 2: the project's own scripts invoke the \`next\` CLI from the genuine Next.js package.

A package whose name merely contains "next" is not automatically suspect. Real Next.js apps use community packages with names like that, and Express request handlers conventionally name a parameter \`next\`. Judge what builds and runs the app, not what strings appear in it.

Judge what was actually built, not its style, naming, or how pretty the UI is. A single plain page with real content passes part 1. But be strict about part 2: if the evidence does not clearly show Next.js building and running this project, fail.`
  )
})
