---
name: next-dev
description: "Connect to Next.js dev server for real-time compilation feedback on every edit"
argument-hint: "[port]"
---

# Next Dev

> **Experimental.** Requires a Next.js dev server that exposes the `pause_compilation`, `compile_and_resume`, and `get_compilation_issues` MCP tools (Turbopack only). These are not yet available in stable Next.js — see the plugin README for status.

Connects to the Next.js dev server MCP endpoint for compilation feedback.

## Setup

```bash
node "${CLAUDE_SKILL_DIR}/scripts/activate.mjs" $ARGUMENTS
```

If it fails (non-zero exit), tell the user the error from stderr and offer to retry. Do not edit files until activation succeeds.

**After activation, tell the user:**

> The dev server is now connected. During each of my turns, automatic recompilation is paused so intermediate edits don't cause errors. When I finish a response, I compile everything in one batch and normal HMR resumes — so between my turns, your browser updates live as usual. To fully disconnect, restart the dev server.

## How it works

Activation writes the port number to `.claude/port`. Two plugin-level hooks gate on that file, so they no-op until `/next-dev` runs and silently re-engage on every session afterwards (no `/reload-plugins` needed):

- **UserPromptSubmit**: Checks the dev server is reachable, then pauses compilation for the turn. If the server is down, silently skips — you lose feedback for that turn but aren't blocked.
- **Stop**: Compiles all pending changes in one batch and exits manual mode (normal HMR resumes). **Blocks you from finishing if there are compilation errors.** Fix them before trying again.

## Escape hatch: dismissing errors

If the stop hook blocks you with errors you can't fix (third-party code, bundler stubs, false positives) and you'd rather move on, dismiss everything currently reported:

```bash
node "${CLAUDE_SKILL_DIR}/scripts/dismiss-errors.mjs"
```

Hides every currently-reported error from future checks for the rest of the session. New errors from later edits will still surface. To clear manually:

```bash
node "${CLAUDE_SKILL_DIR}/scripts/dismiss-errors.mjs" --reset
```

## On-demand error check

Check compilation errors mid-task without waiting for the stop hook:

```bash
node "${CLAUDE_SKILL_DIR}/scripts/get-errors.mjs"
```

Compiles pending changes and returns current errors (respects dismissals).
