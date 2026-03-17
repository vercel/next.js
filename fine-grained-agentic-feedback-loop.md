# Fine-Grained Agentic Feedback Loop Using Next.js Dev Server Paradigm

**Author:** @jude.gao
**Status:** Draft
**Date:** 2026-03-15

---

## 1. Motivation

HMR exists to give the human developer a tight edit→compile→preview loop. The dev server watches the filesystem, detects changes, and recompiles incrementally. This works because human input frequency is low (seconds between saves) and the unit of change is a single file.

Agents break both assumptions:

- **Input frequency is high.** An agent can emit multiple file writes in milliseconds. The file watcher's 5ms debounce fires mid-batch, compiling partial/incoherent states.
- **Unit of change is a multi-file patch.** A single logical step for an agent may touch N files. There is no signal for "I'm done writing" — the dev server cannot distinguish an in-progress batch from a completed one.
- **Feedback path is passive.** The agent writes files, then has to poll or guess when compilation finished. There is no synchronous "apply this, tell me if it compiles" API.

The core idea: replace the implicit filesystem-watch trigger with an **explicit patch submission API**. The agent produces a patch, submits it to the dev server along with the URLs it affects, and gets back compile errors, runtime errors, and screenshots — all in one synchronous call.

## 2. Architecture

### Stateful Daemon + Stateless CLI

| Component                                        | Role                                                                                                                                                              |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `next dev` (daemon)                              | Holds compilation state (module graph, FS cache). One per session. Writes `.next/dev/lock` for discovery.                                                         |
| `next internal apply <patch> --url <path>` (CLI) | Stateless. Writes files to disk, POSTs to `/_next/dev/apply` to trigger invalidation + compilation, orchestrates `next-browser` for screenshots + runtime errors. |

**Why the agent provides `--url`:** Turbopack compiles lazily — only on page request. A file change alone does not trigger compilation. The agent knows which pages its change affects, so it lists them. The dev server uses these URLs to trigger compilation. `next-browser` uses the same URLs for screenshots and runtime error capture.

```
Agent                        CLI                          Daemon
  │ patch + URLs              │                                │
  │──────────────────────────►│                                │
  │                           │ 1. parse patch, write files    │
  │                           │ 2. POST /_next/dev/apply       │
  │                           │───────────────────────────────►│
  │                           │                                │ invalidateFileSystemCache()
  │                           │                                │ wait for compilation end
  │                           │                 200 OK         │
  │                           │◄───────────────────────────────│
  │                           │ 3. next-browser goto <url>     │
  │                           │ 4. next-browser errors         │
  │                           │ 5. next-browser screenshot     │
  │ JSON result (sync)        │                                │
  │◄──────────────────────────│                                │
  │ if errors → fix → retry ──┘                                │
```

### Why the Server-Side Endpoint is Load-Bearing

A natural question: can this be fully standalone, with no server-side component? Just write files, wait a bit for the file watcher to pick them up, then visit the URL?

**No.** The file watcher approach is fundamentally racy:

- Turbopack maintains an **internal filesystem cache**. Even after files are written to disk, Turbopack may read stale cached content on the next compilation unless its cache is explicitly invalidated.
- The file watcher (Watchpack, 5ms debounce) is **asynchronous and non-deterministic**. There is no way for an external tool to know when Watchpack has detected the changes and when Turbopack has finished recompiling.
- A hardcoded sleep (e.g., 100-200ms) works most of the time but fails unpredictably — sometimes the file watcher is slow, sometimes compilation takes longer. This is the kind of bug that works in testing and breaks in production.

The `/_next/dev/apply` endpoint solves this deterministically:

1. **`project.invalidateFileSystemCache()`** — explicitly tells Turbopack its FS cache is stale. No file watcher involved.
2. **Compilation-end listener** — a one-shot callback on Turbopack's `updateInfoSubscribe` `'end'` event. The endpoint returns only after recompilation finishes. No polling, no guessing.

This is the minimum that must live inside Next.js. Everything else — patch parsing, file writing, `next-browser` orchestration — is external.

### Patch Format: Search/Replace

Unified diff (`git diff`) was the initial format, but LLMs can't reliably produce it — line numbers, context-line prefixing, and hunk headers require precise counting that LLMs are bad at. The production format is search/replace blocks:

```
--- file: app/page.tsx
--- search
      <h1>Hello World</h1>
--- replace
      <h1>Hello Agentic World</h1>
---
```

No line numbers, no counting, no leading-space convention. The agent just says "find this, replace with this." Also supports `--- create` (new file) and `--- delete`. Multiple blocks can target the same file or different files in one patch.

The agent must participate directly in the apply→error→fix loop. A shim that intercepts Write/Edit calls would hide compile errors from the agent and break the feedback cycle.

## 3. What One Apply Call Does

A single `next internal apply` is one function. There are no separate phases — the URL visit that triggers compilation also gives you runtime state and screenshots for free.

1. **Parse patch and write files** — search/replace blocks applied atomically. If any search text isn't found, early exit with error. (CLI, external)
2. **Invalidate + recompile** — POST to `/_next/dev/apply`. The endpoint calls `invalidateFileSystemCache()`, waits for recompilation to settle, returns. (Server-side, inside Next.js)
3. **Visit each URL via `next-browser`** — this single visit does three things:
   - **Triggers page render** (which uses the freshly compiled output)
   - **Captures runtime errors** (JS exceptions, React error boundaries, console errors)
   - **Takes a screenshot** (saved to temp folder, path returned in response)
4. **Collect and return everything** — diffs summary, compile errors, runtime errors, screenshot paths.

### Response Shape

```json
{
  "success": true,
  "affectedFiles": ["app/page.tsx"],
  "diffs": [
    {
      "file": "app/page.tsx",
      "type": "modify",
      "summary": "-1 lines, +1 lines"
    }
  ],
  "pages": [
    {
      "url": "/",
      "screenshot": "/var/folders/.../next-browser-123.png",
      "compileErrors": [],
      "runtimeErrors": []
    }
  ],
  "durationMs": 760
}
```

Screenshots are always captured. The agent reads them if the change is visual, ignores them if not. Zero extra cost — we're visiting the URL anyway.

## 4. Implementation

### What Lives Inside Next.js

Minimal. One endpoint in the hot-reloader middleware:

**`POST /_next/dev/apply`** — accepts `{ urls }`, does:

1. `project.invalidateFileSystemCache()`
2. Registers a one-shot listener on `updateInfoSubscribe` `'end'`
3. Waits for the listener to fire (compilation done)
4. Returns 200

The endpoint does NOT parse patches, write files, or call `next-browser`. It only provides the "invalidate and wait for recompile" primitive that cannot be done externally.

### What Lives Outside Next.js

Everything else:

| Component      | Responsibility                                                                                      |
| -------------- | --------------------------------------------------------------------------------------------------- |
| CLI tool       | Parse search/replace patch, write files, call the endpoint, orchestrate `next-browser`, return JSON |
| `next-browser` | Page visits, runtime error capture, screenshots (external CLI)                                      |
| Patch format   | Search/replace parser (no Next.js dependency)                                                       |

### Files (current prototype)

| File                                     | Purpose                                              |
| ---------------------------------------- | ---------------------------------------------------- |
| `server/dev/patch-apply.ts`              | Search/replace parser + atomic filesystem applicator |
| `server/dev/agentic-apply-middleware.ts` | `POST /_next/dev/apply` endpoint                     |
| `cli/next-dev-apply.ts`                  | `next internal apply` CLI                            |
| `server/dev/hot-reloader-turbopack.ts`   | Middleware wiring; compilation-end listeners         |
| `bin/next.ts`                            | CLI registration                                     |

### Verified Results

| Step                     | Result           | Duration |
| ------------------------ | ---------------- | -------- |
| Valid change (cold)      | `success: true`  | 772ms    |
| Syntax error             | `success: false` | 1168ms   |
| Fix the error            | `success: true`  | 808ms    |
| Hydration error detected | `success: false` | 761ms    |

## 5. AGENTS.md Content (for User Projects)

See `/tmp/agentic-test-app/AGENTS.md` for the full content. Key points:

- Dev server must be running before any code changes
- `next-browser` must be open
- Never modify source files directly — all changes via `next internal apply - --url /` with patch piped via stdin
- Always provide `--url` for every affected page
- Fix errors before proceeding

## 6. Next Steps

1. **Refactor: extract standalone CLI** — move patch parsing, file writing, and `next-browser` orchestration out of Next.js into a standalone package. Keep only the `/_next/dev/apply` invalidation endpoint inside Next.js.
2. **Test with Claude Code headless** — temp project with AGENTS.md, verify agents follow the workflow end-to-end.
3. **Diff format edge cases** — test search/replace with large files, multiple matches, whitespace sensitivity.
