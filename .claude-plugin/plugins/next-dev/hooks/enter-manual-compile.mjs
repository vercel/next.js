#!/usr/bin/env node
/**
 * UserPromptSubmit hook (skill-scoped). At the start of each agent turn:
 *   1. Checks the dev server is reachable (precondition gate)
 *   2. Pauses compilation so intermediate edits don't trigger HMR
 *
 * Silent no-op if the port file is missing or the server is unreachable.
 * If the server goes down mid-session, the agent simply loses compilation
 * feedback for that turn — the Stop hook exits 0 gracefully.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { getPort, ping, pauseCompilation } from './mcp-client.mjs'

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd()
const portFile = join(projectDir, '.claude', 'port')

if (!existsSync(portFile)) {
  process.exit(0)
}

try {
  const port = getPort()
  const reachable = await ping(port)
  if (!reachable) {
    process.exit(0)
  }
  await pauseCompilation(port)
} catch {
  // Server unreachable — silent no-op. Stop hook handles gracefully.
}
