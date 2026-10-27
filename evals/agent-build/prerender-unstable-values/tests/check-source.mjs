// Source checks for nextjs/prerender-unstable-values.
//
// These reject the shortcuts the error pages warn against and the ones agents
// reach for in the feedback reports: opting the route out, suppressing the
// hydration warning, hardcoding the year, or editing the vendored SDK. They
// do not prescribe which supported fix the agent uses at each site; the
// behavioral checks and the server log decide that.
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

// 1. Cache Components stays on and nothing opts out or hides the problem.
if (!/cacheComponents\s*:\s*true/.test(config)) {
  fail('Cache Components must remain enabled.')
}
if (/ignoreBuildErrors\s*:\s*true/.test(config)) {
  fail('The build must keep type checking.')
}
if (/validationLevel/.test(config)) {
  fail('Instant validation must keep its default level.')
}

const forbidden = [
  [/\binstant\s*=\s*false\b/, 'No route may opt out of instant validation.'],
  [
    /\bdynamic\s*=\s*['"]force-dynamic['"]/,
    'No route may force dynamic rendering.',
  ],
  [/\bsuppressHydrationWarning\b/, 'Do not suppress the hydration warning.'],
  [/\bunstable_noStore\s*\(/, 'Do not opt the route out of prerendering.'],
]

for (const [path, contents] of files) {
  for (const [pattern, message] of forbidden) {
    if (pattern.test(contents)) fail(`${message} (${path})`)
  }
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

// 3. The footer still derives the year rather than hardcoding it.
const footerSources = files
  .filter(([path]) => /footer/i.test(path) || path === 'app/layout.tsx')
  .map(([, contents]) => contents)
  .join('\n')
if (/\b20\d\d\b/.test(footerSources)) {
  fail('The footer year must be derived from the current date, not hardcoded.')
}
if (!/\bDate\b/.test(footerSources)) {
  fail('The footer must still compute the year from the current date.')
}

// 4. The incident data stays cached with a lifetime, and the relative time
//    is still rendered by a Client Component.
const incidents = read('lib/incidents.ts') ?? ''
if (!/['"]use cache['"]/.test(incidents) || !/cacheLife\s*\(/.test(incidents)) {
  fail('Incident data must stay in a cached function with a cache lifetime.')
}

const clientSources = files
  .filter(([, contents]) => /^\s*['"]use client['"]/m.test(contents))
  .map(([, contents]) => contents)
  .join('\n')
if (!/data-testid=["']relative-time["']/.test(clientSources)) {
  fail('Incident start times must still be rendered by a Client Component.')
}
