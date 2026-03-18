import { readFileSync } from 'node:fs'
import type { Sandbox } from '@vercel/agent-eval'

/**
 * Install the locally-built Next.js into the sandbox.
 *
 * The tarball path comes from run-evals.js via NEXT_EVAL_TARBALL, the same
 * env-var handoff that run-tests.js uses for NEXT_TEST_PKG_PATHS. We hard-fail
 * if it's missing rather than falling back to npm — silently testing the
 * published canary instead of your local build defeats the point.
 */
export async function installNextJs(sandbox: Sandbox): Promise<void> {
  const tarball = process.env.NEXT_EVAL_TARBALL
  if (!tarball) {
    throw new Error(
      'NEXT_EVAL_TARBALL not set. Run evals via `pnpm eval` from the repo root.'
    )
  }
  await sandbox.writeFiles({
    // @ts-expect-error — upstream types writeFiles as Record<string, string>
    // but the runtime accepts Buffer. Tarballs are binary; can't send as string.
    'next.tgz': readFileSync(tarball),
  })
  const { exitCode, stderr } = await sandbox.runCommand('npm', [
    'install',
    './next.tgz',
  ])
  if (exitCode !== 0) {
    throw new Error(
      `npm install ./next.tgz failed (exit ${exitCode}):\n${stderr}`
    )
  }
}

/**
 * Write AGENTS.md (and aliases) to the sandbox root, directing agents to read
 * bundled docs from node_modules/next/dist/docs/.
 */
export async function writeAgentsMd(sandbox: Sandbox): Promise<void> {
  const body = `<!-- BEGIN:nextjs-agent-rules -->

# Next.js: ALWAYS read docs before coding

Before any Next.js work, find and read the relevant doc in \`node_modules/next/dist/docs/\`. Your training data is outdated — the docs are the source of truth.

<!-- END:nextjs-agent-rules -->
`
  await sandbox.writeFiles({
    'AGENTS.md': body,
    'CLAUDE.md': '@AGENTS.md\n',
  })
}
