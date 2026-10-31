// Source checks for nextjs/protected-routes-instant-scope.
//
// Only the constraints the instruction states and behavior cannot show: Cache
// Components stays on, and dependencies and the vendored SDK are unchanged.
// Opt-outs, redirects, isolation, and expired sessions are left to the shells,
// HTTP checks, and server log.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.env.EVAL_APP_ROOT ?? '/app'
const baseGit = process.env.EVAL_BASE_GIT ?? '/opt/eval/base.git'

function fail(message) {
  throw new Error(message)
}

const read = (path) =>
  existsSync(join(root, path)) ? readFileSync(join(root, path), 'utf8') : null

const config = read('next.config.ts') ?? ''

if (!/cacheComponents\s*:\s*true/.test(config)) {
  fail('Cache Components must remain enabled.')
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
