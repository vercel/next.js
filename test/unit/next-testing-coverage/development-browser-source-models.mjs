import assert from 'node:assert/strict'
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  symlinkSync,
  rmSync,
} from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'

const [rootArg, destinationArg, kind = 'tsx', sdkArg] = process.argv
  .slice(2)
  .filter((value) => value !== '--installed')
assert(rootArg && destinationArg && ['tsx', 'jsx'].includes(kind))
const repo = resolve(rootArg)
const out = resolve(destinationArg)
const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(join(repo, 'package.json'))
const referenceFile = join(
  here,
  'fixtures/development-browser-source-models',
  `pristine-${kind}.json`
)
const reference = JSON.parse(readFileSync(referenceFile))
let sdk
if (sdkArg) sdk = resolve(sdkArg)
else {
  try {
    sdk = dirname(require.resolve('playwright/package.json'))
  } catch {
    sdk = dirname(
      createRequire(require.resolve('@playwright/test/package.json')).resolve(
        'playwright/package.json'
      )
    )
  }
}
if (process.argv.includes('--installed'))
  for (const name of ['vitest', 'vite'])
    assert.throws(() => require.resolve(name))
mkdirSync(out)
const fixture = mkdtempSync(join(repo, `.coverage-development-${kind}-`))
try {
  for (const [name, descriptor] of Object.entries(reference.sourceFiles)) {
    const bytes = readFileSync(join(here, 'fixtures', descriptor.fixture))
    assert.equal(
      createHash('sha256').update(bytes).digest('hex'),
      descriptor.sha256
    )
    writeFileSync(join(fixture, name), bytes)
  }
  mkdirSync(join(fixture, 'node_modules'))
  symlinkSync(sdk, join(fixture, 'node_modules/playwright'))
  writeFileSync(
    join(fixture, 'next.config.mjs'),
    'export default ' +
      JSON.stringify({
        turbopack: { root: repo },
        experimental: { turbopackSharedRuntime: true },
      }) +
      '\n'
  )
  mkdirSync(join(fixture, 'app'))
  writeFileSync(
    join(fixture, 'app/layout.jsx'),
    'export default function Layout({children}){return <html><body>{children}</body></html>}\n'
  )
  writeFileSync(
    join(fixture, 'app/page.jsx'),
    'export default function Page(){return <p>Development source coverage</p>}\n'
  )
  const env = {
    ...process.env,
    NODE_ENV: 'development',
    CI: '1',
    NEXT_TELEMETRY_DISABLED: '1',
    FORCE_COLOR: '0',
  }
  for (const key of [
    'NODE_OPTIONS',
    'NODE_PATH',
    'PLAYWRIGHT_BROWSERS_PATH',
    'NEXT_TEST_NATIVE_DIR',
    'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
  ])
    delete env[key]
  const owner = await runOwnedNode(
    [
      join(here, 'development-browser-source-models-worker.mjs'),
      repo,
      fixture,
      out,
      referenceFile,
    ],
    { cwd: fixture, env, auditDir: join(out, 'owners'), timeoutMs: 180000 }
  )
  writeFileSync(join(out, 'owner.json'), JSON.stringify(owner, null, 2) + '\n')
  writeFileSync(join(out, 'stdout.log'), owner.stdout)
  writeFileSync(join(out, 'stderr.log'), owner.stderr)
  assertOwnedNodeCompleted(owner, 'Development Browser source coverage')
  assert.equal(owner.status, 0, owner.stdout + owner.stderr)
  const checks = JSON.parse(readFileSync(join(out, 'CHECKS.json')))
  const controls = JSON.parse(
    readFileSync(join(out, 'development-jsx-negative-controls.json'))
  )
  writeFileSync(
    join(out, 'RESULTS.json'),
    JSON.stringify(
      {
        ...checks,
        kind,
        playwright: JSON.parse(readFileSync(join(sdk, 'package.json'))).version,
        controls,
        genuineSourceHashes: Object.fromEntries(
          Object.entries(reference.sourceFiles).map(([name, data]) => [
            name,
            data.sha256,
          ])
        ),
      },
      null,
      2
    ) + '\n'
  )
} finally {
  rmSync(fixture, { recursive: true, force: true })
}
