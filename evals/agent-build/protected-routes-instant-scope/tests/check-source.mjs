// Source checks for nextjs/protected-routes-instant-scope.
//
// These reject the opt-outs the overlay suggests and the reports show agents
// reaching for. They do not prescribe where the redirect or the session read
// lives; the shells, HTTP checks, and server log decide that.
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
  [/\bunstable_noStore\s*\(/, 'Do not opt the route out of prerendering.'],
  [/\bsuppressHydrationWarning\b/, 'Do not suppress hydration warnings.'],
]

for (const [path, contents] of files) {
  for (const [pattern, message] of forbidden) {
    if (pattern.test(contents)) fail(`${message} (${path})`)
  }
}

// CI installs the committed lockfile offline, as the instruction states, so the
// dependency sets must not change. Checked before typecheck so a repair that
// adds a dev dependency fails for the stated reason.
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

const vendorPath = 'lib/vendor/session-sdk.ts'
const vendorNow = read(vendorPath)
if (vendorNow === null) fail(`${vendorPath} must still exist.`)
const vendorBaseline = execFileSync(
  'git',
  ['--git-dir', baseGit, 'show', `HEAD:${vendorPath}`],
  { encoding: 'utf8' }
)
if (vendorNow !== vendorBaseline) {
  fail('lib/vendor/session-sdk.ts is a dependency and must not be edited.')
}

if (!/verifySession\s*\(/.test(files.map(([, c]) => c).join('\n'))) {
  fail('Sessions must still be verified through the vendored SDK.')
}

if (read('app/login/page.tsx') === null) {
  fail('The /login page must still exist.')
}
