# WebMCP HMR demo

From the repository root, after building Next.js:

```sh
pnpm next dev test/development/app-dir/webmcp-hmr --port 3099
```

Open `http://localhost:3099` for App Router or `/legacy` for Pages Router in a
WebMCP-capable browser, such as the Codex browser harness. These tools require
Turbopack; Webpack keeps normal HMR without registering them.

1. Call `pause_hmr({})` through the browser's WebMCP tools. Await its result so
   an active compilation and module update can finish before editing.
2. Edit `counter.tsx`, including temporary syntax errors. The current page and
   counter stay usable while incoming hot updates and build errors are held.
3. Finish the edits and call `resume_hmr({})`. Buffered updates are applied
   together through normal HMR, preserving the counter state.

Pause is scoped to the current document. Other tabs and server compilation
continue normally. It does not prevent navigation or application requests.
Normal HMR limitations still apply: restarting the server or changing an
unsupported Fast Refresh boundary can require a full reload.
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
