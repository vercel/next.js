import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, posix, relative } from 'node:path'
import type { Sandbox } from '@vercel/agent-eval'

const REPO_ROOT = join(process.cwd(), '..')

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
  console.log('  Uploading local Next.js tarball...')
  await sandbox.writeFiles({
    // @ts-expect-error — upstream types only accept strings, but the runtime
    // accepts Buffer. Tarballs are binary and cannot be sent as strings.
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
  console.log('  Installed local Next.js tarball')
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

/**
 * Install the current checkout's skill sources before the coding agent starts.
 *
 * The docs variant intentionally follows links to the canonical skills. This
 * helper is for a separate treatment that evaluates unmerged skill changes
 * without changing the prompt or fixture.
 */
export async function installLocalSkills(
  sandbox: Sandbox,
  skillNames: string[]
): Promise<void> {
  const files: Record<string, string> = {}

  for (const skillName of skillNames) {
    const skillDir = join(REPO_ROOT, 'skills', skillName)
    if (!existsSync(join(skillDir, 'SKILL.md'))) {
      throw new Error(`Next.js skill not found: ${skillName}`)
    }

    for (const file of listFiles(skillDir)) {
      const skillPath = relative(skillDir, file).replaceAll('\\', '/')
      const content = readFileSync(file, 'utf-8')

      // Claude Code reads .claude/skills. Keep the agent-neutral path in sync
      // so the same treatment can support additional coding agents later.
      files[posix.join('.claude', 'skills', skillName, skillPath)] = content
      files[posix.join('.agents', 'skills', skillName, skillPath)] = content
    }
  }

  await sandbox.writeFiles(files)
  console.log(`  Installed local skills: ${skillNames.join(', ')}`)
}

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? listFiles(path) : path
  })
}
