# Next Dev Plugin for Claude Code

> ⚠️ **Experimental.** This plugin requires a Next.js dev server that exposes the `pause_compilation`, `compile_and_resume`, and `get_compilation_issues` MCP tools (Turbopack only). These tools are still landing in canary — see [Status](#status) below before installing.

Real-time Turbopack compilation feedback for agents editing Next.js code. The agent's edits no longer pile up errors silently across many tool calls — compilation is paused while editing, batched once at turn-end, and the agent is blocked from finishing if there are errors.

## Why

Agents editing Next.js code don't open a browser, so Turbopack's on-demand compilation never kicks in. Errors pile up silently and only surface at the final `pnpm build`. This plugin wires the dev server's MCP endpoint into Claude Code so that:

1. **Edits don't trigger HMR.** While the agent is working, the turbo-tasks scheduler is paused. File watchers still mark tasks dirty, but no compilation runs.
2. **One batch compile per turn.** When the agent finishes responding, the Stop hook drains buffered tasks in a single compile cycle and runs `get_compilation_issues` against the full module graph.
3. **The agent is blocked on errors.** If compilation produces errors, the Stop hook returns `decision: block` with the formatted errors, forcing the agent to fix them before stopping.
4. **Normal HMR resumes between turns.** Your browser still updates live when you're not in an agent turn.

For more architectural detail, see the design notes referenced from the Next.js Dev Agent Plugin Notion doc.

## Status

This plugin depends on MCP tools that are not yet in stable Next.js:

| MCP tool | PR | Status |
|----------|----|--------|
| `get_compilation_issues` | [vercel/next.js#92062](https://github.com/vercel/next.js/pull/92062) | Landed |
| `pause_compilation` / `compile_and_resume` | [vercel/next.js#92410](https://github.com/vercel/next.js/pull/92410) | Open |

The activation script verifies these tools are present and refuses to enable hooks otherwise. **Do not install this plugin against an unsupported Next.js version** — the activation will fail with a clear error.

## Installation

### Step 1: Add the Next.js Marketplace

```
/plugin marketplace add vercel/next.js
```

### Step 2: Install the Plugin

```
/plugin install next-dev@nextjs
```

## Usage

In your Next.js project, start the dev server with Turbopack (the default):

```bash
pnpm dev -p 3000
```

Then in Claude Code, activate the skill:

```
/next-dev 3000
```

The skill's activation script will:

1. Write the port to `.claude/port` in your project (state flag)
2. Connect to `localhost:3000/_next/mcp` and verify `get_compilation_issues` is available
3. Warm up Turbopack's module graph in the background (the first compile is the slow one)
4. Clear any stale dismissed-issues file from a previous session

If activation fails, the port file is deleted and the hooks become silent no-ops — normal editing is unaffected.

## Architecture

Hooks are declared at **plugin level** in `hooks/hooks.json`, not in the SKILL.md frontmatter. Skill-scoped hooks are not currently supported by Claude Code (see [anthropics/claude-code#17688](https://github.com/anthropics/claude-code/issues/17688)). To get the same effect, both hooks gate on `.claude/port` and silently no-op when it's missing — so they only do real work after `/next-dev` activation has written the port file.

- **`UserPromptSubmit`** → `hooks/enter-manual-compile.mjs`
  Pings the dev server, then calls `pause_compilation`. Silent no-op if the port file is missing or the server is unreachable.

- **`Stop`** → `hooks/stop-compile-check.mjs`
  Calls `compile_and_resume` (drains pending tasks in one batch), then `get_compilation_issues`. If issues are found, returns `decision: block` with the formatted errors. The hook does not short-circuit on `stop_hook_active`: if the agent can't fix an issue, it can dismiss everything currently reported via `dismiss-errors.mjs` and stop cleanly — the block message itself surfaces that command.

State files are project-local (`$CLAUDE_PROJECT_DIR/.claude/`):

- `.claude/port` — dev server port; existence is the activation flag and the gate for plugin hooks
- `.claude/dismissed-issues.json` — issue keys the agent has dismissed

Hook scripts live under `${CLAUDE_PLUGIN_ROOT}/hooks/` (referenced from `hooks/hooks.json`). Skill scripts live under `${CLAUDE_SKILL_DIR}/scripts/` (referenced from the skill body and from commands the hooks tell the agent to run).

## Files

```
.claude-plugin/plugins/next-dev/
├── .claude-plugin/
│   └── plugin.json
├── hooks/
│   ├── enter-manual-compile.mjs    # UserPromptSubmit: ping + pause_compilation
│   ├── stop-compile-check.mjs      # Stop: compile_and_resume + get_compilation_issues
│   └── mcp-client.mjs              # Shared MCP/SSE client
├── skills/
│   └── next-dev/
│       ├── SKILL.md                # Skill definition + hook bindings
│       └── scripts/
│           ├── activate.mjs        # /next-dev <port> entry point
│           ├── get-errors.mjs      # On-demand error check
│           └── dismiss-errors.mjs  # Classify + dismiss non-actionable errors
└── README.md
```

## Dismissing non-actionable errors

Large projects often have compilation errors the agent can't fix — `node_modules` resolving server-only builtins (`child_process`, `dns`, `net`, `tls`) in client context, Turbopack empty-module stubs, etc. The agent can dismiss these:

```bash
node "${CLAUDE_SKILL_DIR}/scripts/dismiss-errors.mjs"
```

Dismissals are keyed by `severity|filePath|title|startLine:startCol` (matches the server-side dedup key) and persist in `.claude/dismissed-issues.json` for the rest of the session. Activation clears them on the next session.

## Limitations

- **Turbopack only.** The MCP tools rely on the Turbopack hot-reloader; webpack is not supported.
- **Config file changes are not detected.** `get_compilation_issues` builds the module graph for all endpoints, but changes to `next.config.js`, `tsconfig.json`, etc. require a dev server restart.
- **Skill must stay active.** The hooks are scoped to the skill's lifetime. If the skill isn't loaded, normal editing works without compilation feedback.
