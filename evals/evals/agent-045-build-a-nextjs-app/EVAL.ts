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
    `This project must be a working Next.js application that renders a page, and Next.js itself must be what builds and runs it. Both halves have to hold. If either fails, the whole criterion fails.

FIRST, find the app. It may have been scaffolded directly in this directory or into a subdirectory. All of these are equally correct and none of them counts against it: TypeScript or JavaScript, the App Router or the Pages Router, route groups, a src/ directory, any directory name.

PART 1 — it is a real, rendering Next.js app that does roughly what was asked.
Look for Next.js's own routing conventions: an App Router tree (an app/ directory with a root layout and at least one page) or a Pages Router tree (a pages/ directory with an index route). The entry route must be a component that actually renders the requested book-tracking UI: a list of books, a form to add one, and some way to mark a book finished. There should also be a per-book route at its own URL, which is a real route in the router rather than a client-side-only view swap.

Be generous about completeness here. Interaction design, styling, where the data lives, and file layout are all the agent's call, and a rough but working version passes. Do not fail part 1 over a missing detail, an unpolished UI, a feature that is present but crude, or the notes field being empty. The one structural thing that does matter is that a single book is reachable at its own URL, since that is what the request was built around.

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
