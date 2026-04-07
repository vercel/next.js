#!/usr/bin/env node
/**
 * UserPromptSubmit hook (plugin-level, gated on .claude/port).
 * At the start of each agent turn:
 *   1. Checks the dev server is reachable (precondition gate)
 *   2. Pauses compilation so intermediate edits don't trigger HMR
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Why we silently skip when the port file is missing
 * ─────────────────────────────────────────────────────────────────────────
 * The port file is written by activate.mjs only after it verifies that the
 * dev server exposes the required MCP tools. If the file is missing, one of
 * these is true:
 *
 *   (a) The user never ran `/next-dev <port>`. Nothing to do.
 *   (b) Activation ran but failed because the running Next.js version is too
 *       old to expose the required MCP tools (`get_compilation_issues`,
 *       `pause_compilation`, `compile_and_resume`). activate.mjs already
 *       printed a clear error at that point; re-surfacing it on every prompt
 *       would be noise.
 *
 * In either case the correct behaviour is a silent exit — we must not block
 * the user's turn just because the skill isn't functional.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * The Webpack edge case (port file present, but hooks are no-ops)
 * ─────────────────────────────────────────────────────────────────────────
 * The MCP tools are registered unconditionally, but they only do real work
 * when the dev server is running Turbopack. If the user ran `next dev
 * --webpack`, activation still succeeds (the tools exist), so this hook
 * runs. `pause_compilation` becomes a no-op, `get_compilation_issues`
 * returns nothing, and the whole skill degrades silently to doing nothing.
 * That's an acceptable failure mode — webpack users just don't get the
 * compilation-feedback loop, and nothing is broken. We do not try to
 * detect webpack here; the documentation (README + PR) calls out the
 * Turbopack requirement explicitly.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { existsSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { getPort, ping, pauseCompilation } from './mcp-client.mjs'

// CLAUDE_PROJECT_DIR is guaranteed to be set in hook subprocesses.
// https://code.claude.com/docs/en/hooks#reference-scripts-by-path
const portFile = join(process.env.CLAUDE_PROJECT_DIR, '.claude', 'port')

if (!existsSync(portFile)) {
  process.exit(0)
}

// Self-disable if the dev server is gone. The port file persists across
// sessions, but the dev server may not — without this, every turn would
// burn the hook's full timeout trying to reach a dead port. Deleting the
// port file makes subsequent turns instant no-ops; the user re-runs
// `/next-dev <port>` when they bring the server back up.
function selfDisable() {
  try {
    unlinkSync(portFile)
  } catch {}
}

try {
  const port = getPort()
  const reachable = await ping(port)
  if (!reachable) {
    selfDisable()
    process.exit(0)
  }
  await pauseCompilation(port)
} catch {
  selfDisable()
}
