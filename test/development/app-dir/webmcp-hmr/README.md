# WebMCP HMR demo

From the repository root, after building Next.js:

```sh
pnpm next dev test/development/app-dir/webmcp-hmr --port 3099
```

Open `http://localhost:3099` for App Router or `/legacy` for Pages Router in a
WebMCP-capable browser, such as the Codex browser harness.

1. Call `pause_hmr({})` through the browser's WebMCP tools.
2. Edit `counter.tsx`, including temporary syntax errors. The current page and
   counter remain usable while incoming hot updates and build errors are held.
3. Finish the edits and call `resume_hmr({})`. If updates arrived, the page reloads
   once to load the latest files. Intermediate versions are not replayed.

Resuming with changes resets client state. With no pending changes, resuming does
not reload. Pause is scoped to the current document, does not cancel updates
already in progress, and does not prevent navigation or application requests.
If the final files are still broken, resuming shows their errors normally.

The tools use the [WebMCP imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api),
preferring `document.modelContext` with support for the older
`navigator.modelContext`. Unsupported browsers keep normal HMR behavior.

Regression tests:

```sh
pnpm test-dev-turbo test/development/app-dir/webmcp-hmr/webmcp-hmr.test.ts
pnpm test-dev-webpack test/development/app-dir/webmcp-hmr/webmcp-hmr.test.ts
pnpm exec jest packages/next/src/next-devtools/dev-overlay/webmcp.test.ts --runInBand
```

The integration tests capture tool registrations in browsers without WebMCP and
observe real HMR socket messages. Manual Codex harness verification invokes the
page's tools directly, without the test registry.
