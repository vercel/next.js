import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from './process-supervisor.mjs'

const [consumerArg, outputArg] = process.argv.slice(2)
assert(
  consumerArg && outputArg,
  'Usage: node verify-browser-setup.mjs <installed-consumer> <new-evidence-dir>'
)
const consumer = realpathSync(consumerArg)
const output = resolve(outputArg)
mkdirSync(output)
const require = createRequire(join(consumer, 'package.json'))
const nextRoot = dirname(require.resolve('next/package.json'))
for (const name of ['next', 'playwright', 'react', 'react-dom'])
  assert(
    realpathSync(require.resolve(`${name}/package.json`)).startsWith(
      join(consumer, 'node_modules') + '/'
    ),
    `${name} must resolve from the physical consumer installation`
  )
for (const name of ['vitest', 'vite'])
  assert.throws(() => require.resolve(name), `${name} must not be installed`)

const directory = dirname(fileURLToPath(import.meta.url))
const resources = resolve(
  directory,
  '../../../unit/next-testing-browser-resources/fixtures'
)
const expected = JSON.parse(
  readFileSync(join(directory, 'browser-setup.expected.json'), 'utf8')
)
const digest = (path) =>
  createHash('sha256').update(readFileSync(path)).digest('hex')
const save = (dir, name, value) =>
  writeFileSync(join(dir, name), JSON.stringify(value, null, 2) + '\n')

for (const mode of ['development', 'production']) {
  for (const variant of [
    'setup-list',
    'setup-failure',
    'setup-exported-promise',
  ]) {
    const failing = variant === 'setup-failure'
    const promiseExport = variant === 'setup-exported-promise'
    const oracle = failing
      ? expected.failure.modes[mode]
      : promiseExport
        ? expected.exportedPromise.modes[mode]
        : expected.modes[mode]
    const files = failing || promiseExport ? 1 : 2
    const totalTests = failing ? 0 : promiseExport ? 1 : 4
    const sourceSHA256 = failing
      ? expected.failure.reference.sourceSHA256
      : promiseExport
        ? expected.exportedPromise.reference.sourceSHA256
        : expected.reference.sourceSHA256
    const evidence = join(output, mode, variant)
    mkdirSync(evidence, { recursive: true })
    const fixture = join(consumer, `.next-test-browser-setup-${randomUUID()}`)
    mkdirSync(fixture)
    mkdirSync(join(fixture, 'app'))
    mkdirSync(join(fixture, 'node_modules/next-test-production-target'), {
      recursive: true,
    })
    const sources = {}
    for (const [name, hash] of Object.entries(sourceSHA256)) {
      copyFileSync(join(resources, variant, `${name}.txt`), join(fixture, name))
      assert.equal(digest(join(fixture, name)), hash)
      sources[name] = hash
    }
    for (const name of [
      'package.json',
      'browser-production.mjs',
      'browser-development.mjs',
      'browser-default.mjs',
      'node.mjs',
      'other.mjs',
    ]) {
      const target = `node_modules/next-test-production-target/${name}`
      copyFileSync(
        join(
          resources,
          'production-mode/conditional-target',
          `${name}${name.endsWith('.mjs') ? '.txt' : ''}`
        ),
        join(fixture, target)
      )
      sources[target] = digest(join(fixture, target))
    }
    writeFileSync(join(fixture, 'next.config.mjs'), 'export default {}\n')
    writeFileSync(
      join(fixture, 'app/layout.jsx'),
      'export default function Layout({children}) { return <html><body>{children}</body></html> }\n'
    )
    writeFileSync(
      join(fixture, 'app/page.jsx'),
      'export default function Page(){return <p>Setup fixture</p>}\n'
    )
    writeFileSync(
      join(fixture, 'next.test.config.json'),
      JSON.stringify({
        maxWorkers: 1,
        projects: [
          {
            name: 'browser-setup',
            mode,
            include: ['*.test.mjs'],
            setupFiles: failing
              ? ['setup-one.mjs', 'setup-two.mjs', 'setup-three.mjs']
              : ['setup-one.mjs', 'setup-two.mjs'],
            sequence: { setupFiles: 'list' },
            testTimeout: 5000,
            hookTimeout: 5000,
            fileTimeout: 60000,
            browser: { enabled: true, viewport: { width: 640, height: 480 } },
          },
        ],
      })
    )
    save(evidence, 'inputs.json', {
      runtime: process.version,
      executable: realpathSync(process.execPath),
      next: realpathSync(nextRoot),
      mode,
      fixture,
      sources,
      reference: expected.reference,
    })
    const env = {
      ...process.env,
      NODE_ENV: mode,
      NEXT_TELEMETRY_DISABLED: '1',
      FORCE_COLOR: '0',
    }
    for (const key of [
      'CI',
      'NODE_OPTIONS',
      'NODE_PATH',
      'NEXT_TEST_NATIVE_DIR',
      'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
    ])
      delete env[key]
    try {
      const args = [
        join(nextRoot, 'dist/bin/next'),
        'test',
        fixture,
        '--run',
        '--reporter=json',
        '--outputFile',
        join(evidence, 'report.json'),
      ]
      save(evidence, 'command.json', { args, cwd: fixture })
      const result = await runOwnedNode(args, {
        cwd: fixture,
        env,
        auditDir: join(evidence, 'processes'),
        timeoutMs: 120000,
      })
      writeFileSync(join(evidence, 'stdout.log'), result.stdout)
      writeFileSync(join(evidence, 'stderr.log'), result.stderr)
      assertOwnedNodeCompleted(result, `installed Browser setup ${mode}`)
      const report = JSON.parse(
        readFileSync(join(evidence, 'report.json'), 'utf8')
      )
      const cases = report.testResults.flatMap((file) =>
        file.assertionResults.map(({ fullName, status, failureMessages }) => ({
          fullName,
          status,
          failureMessages,
        }))
      )
      const rows = report.next.events
        .filter((event) => event.type === 'output')
        .flatMap((event) => event.text.split('\n'))
        .filter((line) =>
          /^BROWSER_SETUP_(CASE|FILE|FAILURE|PROMISE) /.test(line)
        )
        .map((line) => ({
          kind: line.slice(0, line.indexOf(' ')),
          row: JSON.parse(line.slice(line.indexOf(' ') + 1)),
        }))
      save(evidence, 'actual-cases.json', cases)
      save(evidence, 'actual-rows.json', rows)
      save(evidence, 'exit.json', { status: result.status })
      assert.equal(result.status, failing ? 1 : 0)
      assert.deepEqual(cases, oracle.cases)
      assert.deepEqual(rows, oracle.rows)
      assert.equal(report.numTotalTests, totalTests)
      assert.equal(report.numPassedTests, totalTests)
      assert.equal(report.testResults.length, files)
      assert(
        !report.next.events.some(
          (event) =>
            event.type === 'output' &&
            /BROWSER_SETUP_(UNREACHED|LATER_UNREACHED)/.test(event.text)
        )
      )
      for (const file of report.testResults) {
        assert.equal(file.status, failing ? 'failed' : 'passed')
        if (failing) assert.match(file.message, /awaited setup failed/)
        else assert.equal(file.message, '')
      }
      assert.deepEqual(
        report.next.events
          .filter((event) => event.type === 'file-start')
          .map((event) => event.entry.profile),
        (files === 1 ? ['a'] : ['a', 'b']).map(() => ({
          id: 'browser-setup',
          environment: 'browser',
          mode,
          runtime: 'nodejs',
          bundler: 'turbopack',
          browserClient: true,
        }))
      )
      save(evidence, 'verification.json', {
        cases: cases.length,
        fullRows: rows.length,
        exactReferenceCasesAndRows: true,
      })
    } finally {
      for (const [name, hash] of Object.entries(sources))
        assert.equal(
          digest(join(fixture, name)),
          hash,
          `Fixture changed: ${name}`
        )
      rmSync(fixture, { recursive: true })
      save(evidence, 'closed.json', {
        fixtureRemoved: true,
        sourceHashesHeld: true,
      })
    }
  }
}
save(output, 'verification.json', {
  modes: 2,
  cases: 8,
  fullRows: 12,
  exportedPromiseCases: 2,
  exportedPromiseRows: 2,
  rejectionFiles: 2,
  rejectionRows: 6,
  laterSetupAndMainNeverLoaded: true,
  exactReferenceCasesAndRows: true,
})
console.log(
  'Installed Browser setup: 8 cases and 12 full rows match; two setup rejections collect zero cases and stop later setup/main'
)
