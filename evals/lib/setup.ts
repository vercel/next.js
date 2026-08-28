import { readFileSync } from 'node:fs'
import type { Sandbox } from '@vercel/agent-eval'

/**
 * Whether the fixture is already a Next.js app.
 *
 * Almost every fixture is: it ships a Next.js project and asks the agent to change
 * something about it. The exceptions are the framework-choice evals, which hand
 * over an empty directory and ask what the agent reaches for. Setting Next.js up
 * for those before the agent starts answers the question for it, so the steps below
 * skip them. Keyed off the fixture's own manifest, so neither kind needs wiring
 * here when it is added.
 */
async function isNextApp(sandbox: Sandbox): Promise<boolean> {
  try {
    const pkg = JSON.parse(await sandbox.readFile('package.json'))
    return Boolean(pkg.dependencies?.next ?? pkg.devDependencies?.next)
  } catch {
    return false
  }
}

/**
 * Install the locally-built Next.js into the sandbox.
 *
 * The tarball path comes from run-evals.js via NEXT_EVAL_TARBALL, the same
 * env-var handoff that run-tests.js uses for NEXT_TEST_PKG_PATHS. We hard-fail
 * if it's missing rather than falling back to npm — silently testing the
 * published canary instead of your local build defeats the point.
 *
 * A fixture that does not already depend on Next.js is left alone. Such an eval
 * measures whether the agent picks Next.js at all, so it has to reach npm itself,
 * and it is therefore not exercising your local build.
 */
export async function installNextJs(sandbox: Sandbox): Promise<void> {
  if (!(await isNextApp(sandbox))) {
    console.log('> Fixture does not depend on Next.js; leaving it untouched')
    return
  }

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
 *
 * Skipped for a fixture that is not already a Next.js app: the path it points at
 * does not exist yet, and naming the framework would give away the answer to the
 * very question those evals ask.
 */
export async function writeAgentsMd(sandbox: Sandbox): Promise<void> {
  if (!(await isNextApp(sandbox))) {
    console.log('> Fixture does not depend on Next.js; skipping AGENTS.md')
    return
  }

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
