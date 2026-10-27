// Source checks for nextjs/prerender-unstable-values.
//
// Only the constraints the instruction states and behavior cannot show: Cache
// Components stays on, dependencies and the vendored SDK are unchanged, and
// the footer year is derived rather than typed in. Everything else, including
// opt-outs and suppressed warnings, is left to the behavioral checks and the
// server log.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = process.env.EVAL_APP_ROOT ?? '/app'
const baseGit = process.env.EVAL_BASE_GIT ?? '/opt/eval/base.git'
const ignore = new Set(['.git', '.next', 'node_modules'])

function fail(message) {
  throw new Error(message)
}

function readTree(directory) {
  return readdirSync(directory).flatMap((entry) => {
    if (ignore.has(entry)) return []
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) return readTree(path)
    if (!/\.(ts|tsx|mts|js|jsx|mjs)$/.test(entry)) return []
    return [[relative(root, path), readFileSync(path, 'utf8')]]
  })
}

const read = (path) =>
  existsSync(join(root, path)) ? readFileSync(join(root, path), 'utf8') : null

const files = readTree(root)
const config = read('next.config.ts') ?? ''

// 1. Cache Components stays on.
if (!/cacheComponents\s*:\s*true/.test(config)) {
  fail('Cache Components must remain enabled.')
}

// 2. CI installs the committed lockfile offline, as the instruction states, so
//    the dependency sets must not change. This is checked before typecheck
//    so a repair that adds a dev dependency fails for the stated reason.
const baselinePkg = JSON.parse(
  execFileSync('git', ['--git-dir', baseGit, 'show', 'HEAD:package.json'], {
    encoding: 'utf8',
  })
)
const currentPkg = JSON.parse(read('package.json') ?? '{}')
for (const field of ['dependencies', 'devDependencies']) {
  if (
    JSON.stringify(baselinePkg[field] ?? {}) !==
    JSON.stringify(currentPkg[field] ?? {})
  ) {
    fail(
      `${field} changed; CI installs the committed lockfile offline, so the fix must not add, remove, or upgrade dependencies.`
    )
  }
}

// 3. The vendored SDK is a dependency and must be byte-identical.
const vendorPath = 'lib/vendor/customer-sdk.ts'
const vendorNow = read(vendorPath)
if (vendorNow === null) fail(`${vendorPath} must still exist.`)
const vendorBaseline = execFileSync(
  'git',
  ['--git-dir', baseGit, 'show', `HEAD:${vendorPath}`],
  { encoding: 'utf8' }
)
if (vendorNow !== vendorBaseline) {
  fail('lib/vendor/customer-sdk.ts is a dependency and must not be edited.')
}

// 4. The footer year is computed, not typed in. A standalone literal of a year
//    around today anywhere in the app's source fails; full dates such as the
//    incident seed data and numbers such as a 2000 ms timeout do not, and the
//    vendored SDK is excluded. Where and how the year is computed is left to
//    the agent.
const thisYear = new Date().getFullYear()
const yearLiteral = new RegExp(
  `(?<![\\d-])(?:${thisYear - 1}|${thisYear}|${thisYear + 1})(?![\\d-])`
)
for (const [path, contents] of files) {
  if (path.startsWith('lib/vendor/') || path.startsWith('tests/')) continue
  if (yearLiteral.test(contents)) {
    fail(`The footer year must be computed, not hardcoded. (${path})`)
  }
}
