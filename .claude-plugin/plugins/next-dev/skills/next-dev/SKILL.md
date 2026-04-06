---
name: next-dev
description: "Connect to Next.js dev server for real-time compilation feedback on every edit"
argument-hint: "[port]"
hooks:
  UserPromptSubmit:
    - hooks:
        - type: command
          command: 'node "${CLAUDE_PLUGIN_ROOT}/hooks/enter-manual-compile.mjs"'
          timeout: 10
  Stop:
    - hooks:
        - type: command
          command: 'node "${CLAUDE_PLUGIN_ROOT}/hooks/stop-compile-check.mjs"'
          timeout: 120
---

# Next Dev

> **Experimental.** Requires a Next.js dev server that exposes the `pause_compilation`, `compile_and_resume`, and `get_compilation_issues` MCP tools (Turbopack only). These are not yet available in stable Next.js — see the plugin README for status.

Connects to the Next.js dev server MCP endpoint for compilation feedback.

## Setup

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/next-dev/scripts/activate.mjs" $ARGUMENTS
```

If it fails (non-zero exit), tell the user the error from stderr and offer to retry. Do not edit files until activation succeeds.

**After activation, tell the user:**

> The dev server is now connected. During each of my turns, automatic recompilation is paused so intermediate edits don't cause errors. When I finish a response, I compile everything in one batch and normal HMR resumes — so between my turns, your browser updates live as usual. To fully disconnect, restart the dev server.

## How it works

Two hooks run while this skill is active:

- **UserPromptSubmit**: Checks the dev server is reachable, then pauses compilation for the turn. If the server is down, silently skips — you lose feedback for that turn but aren't blocked.
- **Stop**: Compiles all pending changes in one batch and exits manual mode (normal HMR resumes). **Blocks you from finishing if there are compilation errors.** Fix them before trying again.

## Noisy / non-actionable errors

If the stop hook blocks you with errors that aren't yours (node_modules, Turbopack stubs, etc.), dismiss them:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/next-dev/scripts/dismiss-errors.mjs"
```

Hides non-actionable errors from all future checks for the rest of the session. Dismissals reset on next activation. To clear manually:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/next-dev/scripts/dismiss-errors.mjs" --reset
```

## On-demand error check

Check compilation errors mid-task without waiting for the stop hook:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/next-dev/scripts/get-errors.mjs"
```

Compiles pending changes and returns current errors (respects dismissals).
