#!/usr/bin/env node
// @ts-check
/**
 * Pack the locally-built `next` package and run agent evals against it.
 *
 *   pnpm eval <eval-name>             run one eval, both variants (baseline + AGENTS.md)
 *   pnpm eval <eval-name> --dry       preview without executing
 *   pnpm eval --all                   run every eval (slow — normally only CI does this)
 *   NEXT_SKIP_PACK=1 pnpm eval ...    reuse tarball from last run
 *
 * Mirrors run-tests.js: pack once, hand paths to child via env, forward args.
 *
 * We only pack `next`, not the whole workspace. The sandbox is remote Linux:
 *   - @next/swc: local darwin binary wouldn't run there; the sandbox downloads
 *     the right one at runtime (packages/next/src/build/swc/index.ts).
 *   - @next/env etc: resolved from npm at the pinned canary version.
 *
 * The experiments/ dir is generated fresh on every run and gitignored. This
 * keeps the two variants (baseline vs. AGENTS.md) in one place instead of
 * maintaining N committed experiment files that only differ by one line.
 */
const path = require('path')
const fs = require('fs')
const { execFileSync, spawnSync } = require('child_process')

const ROOT = __dirname

// Sandbox + agent API keys. agent-eval looks for .env.local in its own cwd
// (evals/), but `vc env pull` writes to the repo root. Load it here so the
// vars are already in process.env when we spawn the child.
try {
  process.loadEnvFile(path.join(ROOT, '.env.local'))
} catch {}

const EVALS_DIR = path.join(ROOT, 'evals')
const FIXTURES_DIR = path.join(EVALS_DIR, 'evals')
const EXPERIMENTS_DIR = path.join(EVALS_DIR, 'experiments')
const TARBALL_DIR = path.join(EVALS_DIR, '.tarballs')
const TARBALL = path.join(TARBALL_DIR, 'next.tgz')

// The two variants we always compare. Order matters for output readability:
// baseline first so a contributor sees "does the agent fail without docs?"
// before "does it pass with docs?".
const VARIANTS = [
  {
    suffix: 'baseline',
    imports: `import { installNextJs } from '../lib/setup.js'`,
    setup: `await installNextJs(sandbox)`,
  },
  {
    suffix: 'agents-md',
    imports: `import { installNextJs, writeAgentsMd } from '../lib/setup.js'`,
    setup: `await installNextJs(sandbox)\n    await writeAgentsMd(sandbox)`,
  },
]

function pack() {
  fs.mkdirSync(TARBALL_DIR, { recursive: true })
  const out = execFileSync(
    'pnpm',
    ['pack', '--pack-destination', TARBALL_DIR],
    { cwd: path.join(ROOT, 'packages/next'), encoding: 'utf8' }
  )
  const produced = out.trim().split('\n').pop()
  const src = path.isAbsolute(produced)
    ? produced
    : path.join(TARBALL_DIR, produced)
  fs.renameSync(src, TARBALL)
}

/** @param {string | null} evalName  null means all evals */
function writeExperiments(evalName) {
  fs.rmSync(EXPERIMENTS_DIR, { recursive: true, force: true })
  fs.mkdirSync(EXPERIMENTS_DIR, { recursive: true })

  const evalsField = evalName ? `\n  evals: '${evalName}',` : ''
  for (const v of VARIANTS) {
    const body = `import type { ExperimentConfig } from '@vercel/agent-eval'
${v.imports}

const config: ExperimentConfig = {
  agent: 'claude-code',
  model: 'claude-opus-4-6',${evalsField}
  scripts: ['build'],
  runs: 1,
  earlyExit: true,
  timeout: 720,
  sandbox: 'auto',
  setup: async (sandbox) => {
    ${v.setup}
  },
}

export default config
`
    fs.writeFileSync(path.join(EXPERIMENTS_DIR, `${v.suffix}.ts`), body)
  }
}

function listEvals() {
  return fs
    .readdirSync(FIXTURES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
}

function main() {
  const argv = require('yargs/yargs')(process.argv.slice(2))
    .command(
      '$0 [eval-name]',
      'Run an eval (baseline + agents-md variants)',
      (y) =>
        y.positional('eval-name', {
          type: 'string',
          describe: 'Fixture directory name',
        })
    )
    .boolean('all')
    .describe('all', 'Run every eval (slow — normally only CI does this)')
    .boolean('dry')
    .describe('dry', 'Preview without executing')
    .conflicts('all', 'eval-name')
    .check((argv) => {
      if (!argv.all && !argv.evalName) {
        throw new Error(
          `Missing <eval-name>.\n\nAvailable evals:\n${listEvals()
            .map((n) => `  ${n}`)
            .join('\n')}`
        )
      }
      if (
        argv.evalName &&
        !fs.existsSync(path.join(FIXTURES_DIR, argv.evalName))
      ) {
        throw new Error(
          `Unknown eval: ${argv.evalName}\n(looked in ${FIXTURES_DIR})`
        )
      }
      return true
    })
    .strict()
    .help().argv

  /** @type {string | null} */
  const evalName = argv.all ? null : /** @type {string} */ (argv.evalName)
  // Flags not consumed here are forwarded to agent-eval.
  const forward = argv.dry ? ['--dry'] : []

  if (!fs.existsSync(path.join(ROOT, 'packages/next/dist'))) {
    console.error(
      'packages/next/dist not found. Run `pnpm --filter=next build` first.'
    )
    process.exit(1)
  }

  if (process.env.NEXT_SKIP_PACK && fs.existsSync(TARBALL)) {
    console.log('> Reusing existing tarball (NEXT_SKIP_PACK=1)')
  } else {
    console.log('> Packing next...')
    pack()
    const mb = (fs.statSync(TARBALL).size / 1024 / 1024).toFixed(1)
    console.log(`  ${TARBALL} (${mb} MB)`)
  }

  writeExperiments(evalName)
  console.log(
    evalName
      ? `> Running ${evalName} (baseline + agents-md)`
      : '> Running all evals (baseline + agents-md)'
  )

  // Same handoff pattern as run-tests.js with NEXT_TEST_PKG_PATHS. We invoke
  // the bin directly rather than via `pnpm exec` because pnpm resets cwd to
  // the workspace root, but agent-eval resolves experiments/ from process.cwd().
  const bin = path.join(ROOT, 'node_modules/.bin/agent-eval')
  const result = spawnSync(bin, ['run-all', '--force', ...forward], {
    cwd: EVALS_DIR,
    stdio: 'inherit',
    env: { ...process.env, NEXT_EVAL_TARBALL: TARBALL },
  })
  if (result.error) {
    // ENOENT (missing bin), EACCES, etc. — spawnSync returns status: null
    // without printing anything, so surface it.
    console.error(`Failed to run ${bin}: ${result.error.message}`)
    if (/** @type {NodeJS.ErrnoException} */ (result.error).code === 'ENOENT') {
      console.error('Did you run `pnpm install`?')
    }
    process.exit(1)
  }
  process.exit(result.status ?? 1)
}

main()
