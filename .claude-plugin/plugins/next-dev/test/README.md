# Local end-to-end testing

This directory has a fake MCP server you can use to exercise the plugin's full
hook flow without spinning up a real Next.js dev server. Useful when iterating
on the plugin itself.

## Run the fake server

```bash
node .claude-plugin/plugins/next-dev/test/start-test-server.mjs 4321
```

It listens on `http://localhost:<port>` and serves the same `/_next/mcp`
JSON-RPC surface that Next.js's real dev server exposes — just enough of it
to make `initialize`, `tools/list`, `pause_compilation`, `compile_and_resume`,
and `get_compilation_issues` work. By default it returns zero compilation
issues.

## Install the plugin from the local marketplace

In a separate Claude Code session, in any working directory:

```
/plugin marketplace add /absolute/path/to/next.js/.claude-plugin
/plugin install next-dev@nextjs
/next-dev 4321
```

> **Note:** point `marketplace add` at the `.claude-plugin/` directory (the
> one that contains `marketplace.json`), not the repo root. Source paths in
> `marketplace.json` resolve relative to whatever path you pass here, so
> pointing at the repo root makes `./plugins/next-dev` resolve to a non-existent
> `<repo>/plugins/next-dev`.

Activation should succeed (the fake server reports the three required tools
as available) and write `.claude/port`. From that point on the plugin's
`UserPromptSubmit` and `Stop` hooks fire on every turn and call into the fake
server.

> **Why plugin-level hooks?** Skill-frontmatter hooks are not currently
> reliably supported by Claude Code (see
> [anthropics/claude-code#17688](https://github.com/anthropics/claude-code/issues/17688)),
> so the hooks live in `hooks/hooks.json` and gate on the existence of
> `.claude/port` instead. Net result is the same: hooks no-op until
> `/next-dev` runs.

## Test the Stop-hook block flow

The fake server has a tiny control surface for injecting fake errors:

```bash
# Make the next Stop hook block
curl -X POST http://localhost:4321/control/issues \
  -H 'content-type: application/json' \
  -d '[{"severity":"error","filePath":"app/page.tsx","title":"Boom","description":"fake error"}]'

# Let the next Stop hook pass again
curl -X POST http://localhost:4321/control/clear

# Inspect current fake state
curl http://localhost:4321/control/state
```

Drive the plugin in Claude Code, toggle errors on, ask the agent to stop —
you should see the block message with the dismiss instructions.

## Test the dismiss escape hatch

`dismiss-errors.mjs` is an unconditional escape hatch: it dismisses every
currently-reported error so the Stop hook stops blocking. There's no heuristic.

1. Inject any fake error (see above) and ask the agent to stop — Stop hook
   blocks.
2. Run the dismiss command from the block message. It dismisses the injected
   error and writes `.claude/dismissed-issues.json`.
3. Ask the agent to stop again — Stop hook now passes.
4. Inject a *different* error and try again — it blocks again, because the
   dismissal only covers the keys recorded at dismiss time.
5. To clear all dismissals: `node <dismiss-script> --reset`. Dismissals also
   reset automatically on the next `/next-dev` activation.

## Test the dev-server-gone self-disable

The plugin self-disables (deletes `.claude/port`) when a hook can't reach the
dev server, so a stale port file from a previous session doesn't burn the
hook timeout on every turn.

1. Activate with `/next-dev 4321`, do a turn — hooks fire.
2. Kill the fake server (Ctrl-C the `start-test-server.mjs` process).
3. Do another turn. The next `UserPromptSubmit` hook will fail its ping and
   delete `.claude/port`. Confirm: `ls /Users/judegao/workspace/empty/.claude/port`
   should now be gone.
4. Subsequent turns are instant no-ops until the user re-runs `/next-dev`.

## Reload after editing

Hook scripts (`hooks/*.mjs`) are re-read on each invocation, so edits take
effect on the next prompt with no restart. Edits to `hooks/hooks.json`,
`SKILL.md`, or skill scripts require uninstalling and reinstalling the
plugin (or running `/reload-plugins`):

```
/plugin uninstall next-dev@nextjs
/plugin install next-dev@nextjs
```
