/**
 * Build a Next.js app
 *
 * Prompt: a small book tracker, described the way someone would actually ask for
 * it, with "Next.js" named in the request. The framework is given, so the question
 * is no longer whether the agent picks Next.js. It is whether an agent told to use
 * Next.js actually delivers Next.js, on a blank slate, with nothing to copy from.
 *
 * The sibling eval agent-044-uses-nextjs runs the identical criterion against the
 * identical request with the framework left out. Read together they separate two
 * failures that look the same on a dashboard: never reaching for Next.js, and
 * reaching for it but shipping something that only resembles it. A pass here with
 * a fail there is the interesting result. Keep the two in sync; the prompts must
 * differ by nothing but the framework mention, or the pair stops isolating
 * framework choice. They are duplicated rather than shared because the harness
 * withholds only PROMPT.md and EVAL.ts from the agent, so a common helper module
 * would be readable by the agent under test.
 *
 * The prompt is deliberately small, concrete and fully specified, so that what it
 * measures is delivery rather than how an agent copes with an underspecified ask.
 *
 * The fixture is a blank slate on purpose. The agent sees exactly one file: a
 * package.json with a placeholder build script and vitest (so this file can run).
 * No app/, no next.config, no react.
 *
 * Judged rather than pattern-matched, for two reasons:
 *
 * - The interesting failure is open-ended. Plenty of things produce an App Router
 *   tree and `next/*` imports without Next.js being what runs the result, so every
 *   structural signal can fire on a project Next.js never touched. Enumerating the
 *   packages that do this dates the eval; the criterion just asks whether Next.js
 *   is what builds and serves the app.
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

PART 1 — it is a real, rendering Next.js app that does roughly what was asked.
Look for Next.js's own routing conventions: an App Router tree (an app/ directory with a root layout and at least one page) or a Pages Router tree (a pages/ directory with an index route). The entry route must be a component that actually renders the requested book-tracking UI: some way to enter a title and author, a list of what has been added, and some way to mark a book finished.

Be generous about completeness here. Interaction design, styling, state management and file layout are all the agent's call, and a rough but working version passes. Do not fail part 1 over a missing detail, an unpolished UI, or a feature that is present but crude.

Fails part 1: there is no routable page at all; the directory is still the empty starting fixture; the page is an empty placeholder, a stub returning null, or a file that only exports metadata; the project is a scaffolding tool's default template with the starter page left untouched, so none of the requested app was actually built; or the agent built a command line program, a bare HTTP server with no UI, or a plain static HTML page with no Next.js routing.

PART 2 — Next.js, and nothing else, is what builds and runs it.

Important: this eval's harness installs the genuine \`next\` package into the project BEFORE the agent starts. So \`next\` appearing in package.json dependencies, or a real Next.js sitting in node_modules, proves nothing about what the agent did. Do not treat either as evidence.

Judge instead from what actually builds and serves the app:
- The build, dev and start scripts. Do they invoke the \`next\` CLI itself, or some other command?
- Is node_modules/next genuinely Next.js? Its package.json name should be exactly "next" and it should expose a \`next\` binary. A dependency entry can point elsewhere, as in "next": "npm:some-other-package@1".

Passes part 2: the project's own scripts run the \`next\` CLI from the genuine Next.js package.

Fails part 2: anything else builds or serves the app, whatever it is called and however much the file tree resembles a Next.js project.

A package whose name merely contains "next" is not automatically suspect. Real Next.js apps use community packages with names like that, and Express request handlers conventionally name a parameter \`next\`. Judge what builds and runs the app, not what strings appear in it.

Judge what was actually built, not its style, naming, or how pretty the UI is. A rough but working book tracker passes part 1. But be strict about part 2: if the evidence does not clearly show Next.js building and running this project, fail.`
  )
})
