import assert from 'node:assert/strict'
import {
  assertCoverageCounters,
  assertPassedCoverageCases,
} from './snapshot-coverage-assertions.mjs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  watchFile,
  unwatchFile,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
const [repoArg, outputArg, mode = 'production'] = process.argv.slice(2)
assert(repoArg && outputArg)
assert.equal(mode, 'production')
const repo = resolve(repoArg),
  output = resolve(outputArg),
  here = dirname(fileURLToPath(import.meta.url))
mkdirSync(output, { recursive: true })
const fixture = mkdtempSync(join(repo, '.next-browser-coverage-cancel-'))
const env = {
  ...process.env,
  NODE_ENV: mode,
  CI: '1',
  NEXT_TELEMETRY_DISABLED: '1',
  FORCE_COLOR: '0',
  TURBO_TASKS_AVAILABLE_PARALLELISM: '4',
}
for (const key of [
  'NODE_OPTIONS',
  'NODE_PATH',
  'NEXT_TEST_NATIVE_DIR',
  'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
])
  delete env[key]
const load = createRequire(join(repo, 'package.json'))
const gate = join(fixture, 'cancel-gate.txt'),
  audit = join(output, 'cancel-owners')
let cancelled = false,
  callbackError
const release = () => {
  if (
    cancelled ||
    !existsSync(gate) ||
    !existsSync(join(audit, 'starts.jsonl'))
  )
    return
  try {
    assert.equal(readFileSync(gate, 'utf8'), 'NEXT_COVERAGE_BODY_STARTED')
    const start = readFileSync(join(audit, 'starts.jsonl'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(JSON.parse)
      .find((row) => row.type === 'start')
    if (!start) return
    cancelled = true
    process.kill(start.pid, 'SIGINT')
  } catch (error) {
    callbackError = error
  }
}
try {
  const original = join(
    here,
    '../app-dir/next-testing-stable-release-gaps/fixtures/coverage-compiler-source-typescript'
  )
  for (const name of ['subject.ts'])
    writeFileSync(join(fixture, name), readFileSync(join(original, name)))
  writeFileSync(
    join(fixture, 'cancel.test.mjs'),
    readFileSync(
      join(
        here,
        'fixtures/browser-production/public-typescript-cancel.contract.test.mjs.txt'
      )
    )
  )
  writeFileSync(
    join(fixture, 'reporter.mjs'),
    readFileSync(
      join(
        here,
        'fixtures/browser-production/public-typescript-cancel-reporter.mjs.txt'
      )
    )
  )
  writeFileSync(
    join(fixture, 'package.json'),
    '{"type":"module","private":true}\n'
  )
  writeFileSync(
    join(fixture, 'next.config.mjs'),
    'export default ' +
      JSON.stringify({
        turbopack: { root: repo },
        experimental: { turbopackSharedRuntime: true },
      }) +
      '\n'
  )
  writeFileSync(
    join(fixture, 'next.test.config.json'),
    JSON.stringify({
      test: {
        maxWorkers: 1,
        mode,
        include: ['cancel.test.mjs'],
        browser: { enabled: true, headless: true },
        coverage: {
          provider: 'v8',
          enabled: true,
          include: ['subject.ts'],
          exclude: [],
          reporter: ['json'],
          reportsDirectory: 'coverage',
          reportOnFailure: true,
          clean: true,
        },
      },
    }) + '\n'
  )
  mkdirSync(join(fixture, 'app'))
  writeFileSync(
    join(fixture, 'app/layout.jsx'),
    'export default function Layout({children}){return <html><body>{children}</body></html>}\n'
  )
  writeFileSync(
    join(fixture, 'app/page.jsx'),
    'export default function Page(){return <p>Coverage cancellation</p>}\n'
  )
  mkdirSync(join(fixture, 'coverage'))
  writeFileSync(join(fixture, 'coverage/sentinel.txt'), 'previous report\n')
  const command = [
    load.resolve('next/dist/bin/next'),
    'test',
    fixture,
    '--run',
    '--reporter=json',
    '--reporter=' + join(fixture, 'reporter.mjs'),
    '--outputFile=cases.json',
  ]
  watchFile(gate, { interval: 20, persistent: false }, release)
  const interval = setInterval(release, 20)
  let owner
  try {
    owner = await runOwnedNode(command, {
      cwd: fixture,
      env,
      auditDir: audit,
      timeoutMs: 120000,
    })
  } finally {
    clearInterval(interval)
    unwatchFile(gate, release)
  }
  writeFileSync(join(output, 'cancel-stdout.log'), owner.stdout)
  writeFileSync(join(output, 'cancel-stderr.log'), owner.stderr)
  assertOwnedNodeCompleted(owner, 'Browser coverage SIGINT')
  if (callbackError) throw callbackError
  assert(cancelled, 'Body must execute before SIGINT')
  assert.equal(owner.status, 130)
  assert.equal(owner.signal, null)
  assert(
    !existsSync(join(fixture, 'cases.json')),
    'OS SIGINT must not publish JSON'
  )
  assert(!existsSync(join(fixture, 'coverage/coverage-final.json')))
  assert(
    !existsSync(join(fixture, 'coverage/sentinel.txt')),
    'Initial cleaning must precede the body'
  )
  writeFileSync(
    join(fixture, 'cancel.test.mjs'),
    readFileSync(join(original, 'contract.case.mjs'))
  )
  const recovery = await runOwnedNode(command, {
    cwd: fixture,
    env,
    auditDir: join(output, 'recovery-owners'),
    timeoutMs: 120000,
  })
  writeFileSync(join(output, 'recovery-stdout.log'), recovery.stdout)
  writeFileSync(join(output, 'recovery-stderr.log'), recovery.stderr)
  assertOwnedNodeCompleted(recovery, 'Browser coverage recovery')
  assert.equal(recovery.status, 0, recovery.stdout + recovery.stderr)
  const report = JSON.parse(readFileSync(join(fixture, 'cases.json'), 'utf8'))
  assertPassedCoverageCases(report, [
    'actual compiler full source TypeScript coverage',
  ])
  const coverage = JSON.parse(
    readFileSync(join(fixture, 'coverage/coverage-final.json'), 'utf8')
  )
  assertCoverageCounters(coverage, fixture, {
    'subject.ts': {
      statements: [2, 1, 1, 1, 0],
      functions: [2, 1, 0],
      branches: [[1, 1]],
    },
  })
  console.log(
    JSON.stringify({ mode, cancelled: true, recovered: true, cases: 1 })
  )
} finally {
  unwatchFile(gate, release)
  rmSync(fixture, { recursive: true, force: true })
}
