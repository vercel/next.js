import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  watchFile,
  unwatchFile,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'

const [
  consumerArg,
  browserProjectArg,
  destinationArg,
  sourceKind = 'typescript',
  mode = 'production',
] = process.argv.slice(2)
assert(['javascript', 'typescript', 'mts', 'tsx', 'jsx'].includes(sourceKind))
assert(['production', 'development'].includes(mode))
assert(sourceKind !== 'mts' || mode === 'development')
assert(
  mode === 'production' ||
    ['javascript', 'typescript', 'mts'].includes(sourceKind)
)
assert(sourceKind !== 'javascript' || mode === 'development')
assert(consumerArg && browserProjectArg && destinationArg)
const consumer = resolve(consumerArg),
  browserProject = resolve(browserProjectArg),
  destination = resolve(destinationArg),
  here = dirname(fileURLToPath(import.meta.url)),
  nextRequire = createRequire(join(consumer, 'package.json')),
  browserRequire = createRequire(join(browserProject, 'package.json')),
  sdkRoot = dirname(browserRequire.resolve('playwright/package.json')),
  sdk = JSON.parse(readFileSync(join(sdkRoot, 'package.json'), 'utf8')).version
assert(['1.61.0', '1.64.0'].includes(sdk))
for (const name of ['vitest', 'vite'])
  assert.throws(() => nextRequire.resolve(name))
const expected = JSON.parse(
  readFileSync(
    join(
      here,
      'fixtures/browser-production/public-' +
        (mode === 'development' ? 'development-' : '') +
        sourceKind +
        '.expected.json'
    ),
    'utf8'
  )
)
const hash = (file) =>
  createHash('sha256').update(readFileSync(file)).digest('hex')
const fixture = mkdtempSync(join(consumer, '.public-typescript-cancel-')),
  gate = join(fixture, 'cancel-gate.txt'),
  entry = 'cancel-entry.contract.test.mjs',
  sources =
    sourceKind === 'javascript'
      ? {
          ...Object.fromEntries(
            ['subject.mjs', 'unimported.mjs'].map((name) => [
              name,
              {
                path: join(
                  here,
                  '../app-dir/next-testing-stable-release-gaps/fixtures/coverage-browser',
                  name
                ),
                sha256: expected.sourceFiles[name].sha256,
              },
            ])
          ),
          [entry]: {
            path: join(
              here,
              'fixtures/browser-production/public-development-javascript-cancel.contract.test.mjs.txt'
            ),
            sha256:
              '465ac5e80c179ffa857ffd7a0aff2fc01a96ced1c163994170358e02623ff87b',
          },
          'cancel-reporter.mjs': {
            path: join(
              here,
              'fixtures/browser-production/public-typescript-cancel-reporter.mjs.txt'
            ),
            sha256:
              '950f9d1770c6465b0ffd6e860ed7d28c87c3a6c0e654f4e3d386672014568205',
          },
        }
      : sourceKind === 'mts'
        ? {
            ...Object.fromEntries(
              ['subject.mts', 'unimported.mts'].map((name) => [
                name,
                {
                  path: join(
                    here,
                    'fixtures/browser-development-mts',
                    name + '.txt'
                  ),
                  sha256: expected.sourceFiles[name].sha256,
                },
              ])
            ),
            [entry]: {
              path: join(
                here,
                'fixtures/browser-production/public-mts-cancel.contract.test.mjs.txt'
              ),
              sha256:
                '6e177de5b90ff082a1aad281dd10acbae61a9508238ac0b26f56c3720607a369',
            },
            'cancel-reporter.mjs': {
              path: join(
                here,
                'fixtures/browser-production/public-typescript-cancel-reporter.mjs.txt'
              ),
              sha256:
                '950f9d1770c6465b0ffd6e860ed7d28c87c3a6c0e654f4e3d386672014568205',
            },
          }
        : sourceKind === 'tsx' || sourceKind === 'jsx'
          ? {
              ...Object.fromEntries(
                Object.entries(expected.sourceFiles)
                  .filter(([name]) => name !== 'contract.test.mjs')
                  .map(([name, source]) => [
                    name,
                    {
                      path: join(
                        here,
                        sourceKind === 'jsx'
                          ? 'fixtures/jsx-standard/basic'
                          : 'fixtures/jsx-owners-public/fragment',
                        (source.fixture ?? name) + '.txt'
                      ),
                      sha256: source.sha256,
                    },
                  ])
              ),
              [entry]: {
                path: join(
                  here,
                  'fixtures/browser-production/public-' +
                    sourceKind +
                    '-cancel.contract.test.mjs.txt'
                ),
                sha256:
                  sourceKind === 'jsx'
                    ? 'd1451f680138cdbb5e5ddcb86f9a62d3105f02c16e49aca6aa65c2e79e52662a'
                    : '1a1889a7be5f62c8cb5f5c4908780f1d8b441064cb71a507190d0ca579b2fdd7',
              },
              'cancel-reporter.mjs': {
                path: join(
                  here,
                  'fixtures/browser-production/public-typescript-cancel-reporter.mjs.txt'
                ),
                sha256:
                  '950f9d1770c6465b0ffd6e860ed7d28c87c3a6c0e654f4e3d386672014568205',
              },
            }
          : {
              'subject.ts': {
                path: join(
                  here,
                  '../app-dir/next-testing-stable-release-gaps/fixtures/coverage-compiler-source-typescript/subject.ts'
                ),
                sha256: expected.sourceFiles['subject.ts'].sha256,
              },
              'unimported.ts': {
                path: join(
                  here,
                  '../app-dir/next-testing-stable-release-gaps/fixtures/coverage-compiler-source-typescript/unimported.ts'
                ),
                sha256: expected.sourceFiles['unimported.ts'].sha256,
              },
              [entry]: {
                path: join(
                  here,
                  'fixtures/browser-production/public-typescript-cancel.contract.test.mjs.txt'
                ),
                sha256:
                  '78d67fd02175dc94622119932562e979cda3809affedade2ac1848287ae75c1a',
              },
              'cancel-reporter.mjs': {
                path: join(
                  here,
                  'fixtures/browser-production/public-typescript-cancel-reporter.mjs.txt'
                ),
                sha256:
                  '950f9d1770c6465b0ffd6e860ed7d28c87c3a6c0e654f4e3d386672014568205',
              },
            }
const activation = {
  backend: 'fs.watchFile',
  intervalMs: 20,
  callbacks: 0,
  invoked: false,
  stopped: false,
}
function watchActualGate(directory, callback) {
  const file = join(directory, 'cancel-gate.txt')
  const listener = (current) => {
    activation.callbacks++
    if (!activation.invoked && current.isFile()) {
      activation.invoked = true
      callback('change', 'cancel-gate.txt')
    }
  }
  const watcher = watchFile(file, { interval: 20, persistent: false }, listener)
  const stopped = new Promise((resolve) =>
    watcher.once('stop', () => {
      activation.stopped = true
      resolve()
    })
  )
  let closed = false
  return {
    async close() {
      if (!closed) {
        closed = true
        unwatchFile(file, listener)
      }
      await stopped
      try {
        writeFileSync(
          join(destination, 'OWNED-STAT-ACTIVATION.json'),
          JSON.stringify({
            ...activation,
            actualGate: file,
            originalCallbackInvokedExactlyOnce: activation.invoked,
          }) + '\n'
        )
      } catch {}
    },
  }
}
let observer,
  cancelled = false,
  callbackError
mkdirSync(destination, { recursive: true })
try {
  for (const [name, source] of Object.entries(sources)) {
    assert.equal(hash(source.path), source.sha256)
    writeFileSync(join(fixture, name), readFileSync(source.path))
  }
  mkdirSync(join(fixture, 'node_modules'))
  symlinkSync(sdkRoot, join(fixture, 'node_modules/playwright'))
  if (!Object.hasOwn(sources, 'package.json'))
    writeFileSync(join(fixture, 'package.json'), '{}\n')
  writeFileSync(
    join(fixture, 'next.config.mjs'),
    'export default ' +
      JSON.stringify({
        turbopack: { root: consumer },
        experimental: { turbopackSharedRuntime: true },
      }) +
      '\n'
  )
  const reports = join(fixture, 'cancel-coverage')
  mkdirSync(reports)
  writeFileSync(join(reports, 'sentinel.txt'), 'prior report\n')
  writeFileSync(
    join(fixture, 'next.test.config.json'),
    JSON.stringify({
      test: {
        mode,
        include: [entry],
        browser: { enabled: true },
        coverage: {
          provider: 'v8',
          enabled: true,
          reportOnFailure: true,
          include:
            sourceKind === 'javascript'
              ? ['subject.mjs', 'unimported.mjs']
              : sourceKind === 'mts'
                ? ['subject.mts', 'unimported.mts']
                : sourceKind === 'tsx' || sourceKind === 'jsx'
                  ? [
                      'subject.' + sourceKind,
                      'unimported.' + sourceKind,
                      'helper.js',
                    ]
                  : ['subject.ts', 'unimported.ts'],
          exclude: [],
          reporter: ['json'],
          reportsDirectory: reports,
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
    'export default function Page(){return <p>TypeScript cancellation</p>}\n'
  )
  const auditDir = join(destination, 'owners')
  observer = watchActualGate(fixture, (_event, file) => {
    if (cancelled || String(file) !== 'cancel-gate.txt' || !existsSync(gate))
      return
    try {
      if (readFileSync(gate, 'utf8') !== 'NEXT_COVERAGE_BODY_STARTED') return
      const starts = readFileSync(join(auditDir, 'starts.jsonl'), 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))
      const start = starts.find((record) => record.type === 'start')
      assert(start && Number.isSafeInteger(start.pid))
      cancelled = true
      writeFileSync(
        join(destination, 'cancel-request.json'),
        JSON.stringify(
          { ...start, signal: 'SIGINT', afterActualSubjectConsole: true },
          null,
          2
        ) + '\n'
      )
      process.kill(start.pid, 'SIGINT')
    } catch (error) {
      callbackError = error
    }
  })
  const env = {
    ...process.env,
    NODE_ENV: mode,
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
      join(nextRequire.resolve('next/package.json'), '../dist/bin/next'),
      'test',
      fixture,
      '--run',
      '--reporter=json',
      '--reporter=' + join(fixture, 'cancel-reporter.mjs'),
      '--outputFile=cases.json',
    ],
    { cwd: fixture, env, auditDir, timeoutMs: 180_000 }
  )
  for (const [name, value] of Object.entries({
    'owner.json': JSON.stringify(owner, null, 2) + '\n',
    'stdout.log': owner.stdout,
    'stderr.log': owner.stderr,
  }))
    writeFileSync(join(destination, name), value)
  if (existsSync(join(fixture, 'cases.json')))
    writeFileSync(
      join(destination, 'cases.json'),
      readFileSync(join(fixture, 'cases.json'))
    )
  assertOwnedNodeCompleted(owner, 'Public production TypeScript cancellation')
  if (callbackError) throw callbackError
  assert(
    cancelled,
    'Observe the subject-executed body before requesting cancellation'
  )
  assert.equal(owner.status, 130)
  assert.equal(owner.signal, null)
  const machine = JSON.parse(
    readFileSync(join(destination, 'cases.json'), 'utf8')
  )
  assert.equal(machine.next.summary.status, 'cancelled')
  assert.equal(machine.next.summary.errors, 0)
  assert.equal(existsSync(join(reports, 'coverage-final.json')), false)
  assert.equal(existsSync(join(reports, 'sentinel.txt')), false)
  for (const [name, source] of Object.entries(sources))
    assert.equal(hash(join(fixture, name)), source.sha256)
  writeFileSync(
    join(destination, 'result.json'),
    JSON.stringify(
      {
        sdk,
        status: 'passed',
        actualSubjectExecutionBeforeSIGINT: true,
        exitCode: 130,
        coveragePublished: false,
        initialClean: true,
        ownersClosed: true,
      },
      null,
      2
    ) + '\n'
  )
} finally {
  await observer?.close()
  rmSync(fixture, { recursive: true, force: true })
}
