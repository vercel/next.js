import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'

const [consumerArg, outputArg] = process.argv.slice(2)
assert(
  consumerArg && outputArg,
  'Usage: node verify.mjs <consumer-or-source-root> <new-evidence-dir>'
)
const consumer = realpathSync(consumerArg)
const output = resolve(outputArg)
mkdirSync(output)
const directory = dirname(fileURLToPath(import.meta.url))
const body = readFileSync(join(directory, 'clock.test.ts.txt'), 'utf8')
const expected = JSON.parse(
  readFileSync(join(directory, 'reference.json'), 'utf8')
)
const digest = (value) => createHash('sha256').update(value).digest('hex')
assert.equal(digest(body), expected.bodySHA256)
const require = createRequire(join(consumer, 'package.json'))
const next = require.resolve('next/dist/bin/next')
const save = (directory, name, value) =>
  writeFileSync(join(directory, name), JSON.stringify(value, null, 2) + '\n')
save(output, 'inputs.json', {
  runtime: process.version,
  executable: realpathSync(process.execPath),
  next: realpathSync(next),
  playwright: JSON.parse(
    readFileSync(require.resolve('playwright/package.json'), 'utf8')
  ).version,
  bodySHA256: digest(body),
  reference: expected.reference,
})
const env = { ...process.env, NEXT_TELEMETRY_DISABLED: '1', FORCE_COLOR: '0' }
for (const name of [
  'CI',
  'NODE_OPTIONS',
  'NODE_PATH',
  'NEXT_TEST_NATIVE_DIR',
  'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
])
  delete env[name]
const profiles = []
for (const mode of ['development', 'production']) {
  for (const engine of ['chromium', 'firefox']) {
    const name = `${engine}-${mode}`
    const evidence = join(output, name)
    mkdirSync(evidence)
    const fixture = join(consumer, `.next-test-browser-clock-${randomUUID()}`)
    mkdirSync(fixture)
    const trace = join(evidence, 'rows.jsonl')
    writeFileSync(trace, '')
    writeFileSync(join(fixture, 'clock.test.ts'), body)
    writeFileSync(
      join(fixture, 'package.json'),
      '{"type":"module","private":true}\n'
    )
    writeFileSync(
      join(fixture, 'next.config.mjs'),
      `export default ${JSON.stringify({ turbopack: { root: consumer } })}\n`
    )
    writeFileSync(
      join(fixture, 'vitest.config.mjs'),
      `export default ${JSON.stringify({
        test: {
          mode,
          environment: 'browser',
          include: ['clock.test.ts'],
          fileParallelism: false,
          maxWorkers: 1,
          cache: false,
          testTimeout: 5000,
          hookTimeout: 5000,
          fakeTimers: {
            now: 946684800000,
            toFake: ['Date', 'setTimeout', 'clearTimeout'],
            loopLimit: 10,
          },
          browser: {
            enabled: true,
            headless: true,
            instances: [{ browser: engine }],
          },
        },
      })}\n`
    )
    writeFileSync(
      join(fixture, 'reporter.mjs'),
      `import{appendFileSync}from'node:fs'\nexport default class{onUserConsoleLog(log){for(const line of log.content.split('\\n'))if(line.startsWith('CLOCK_DATE_ROW '))appendFileSync(${JSON.stringify(trace)},line.slice(15)+'\\n')}}\n`
    )
    let joined = false
    try {
      const args = [
        next,
        'test',
        fixture,
        '--run',
        '--reporter=json',
        `--reporter=${join(fixture, 'reporter.mjs')}`,
        `--outputFile=${join(evidence, 'report.json')}`,
      ]
      save(evidence, 'authored.json', {
        args,
        mode,
        engine,
        bodySHA256: digest(body),
        bounds: { cli: 120000, test: 5000, hook: 5000 },
      })
      const result = await runOwnedNode(args, {
        cwd: fixture,
        env: { ...env, NODE_ENV: mode },
        auditDir: join(evidence, 'owners'),
        timeoutMs: 120000,
      })
      save(evidence, 'result.json', result)
      writeFileSync(join(evidence, 'stdout.log'), result.stdout)
      writeFileSync(join(evidence, 'stderr.log'), result.stderr)
      assertOwnedNodeCompleted(result, name)
      joined = true
      assert.equal(result.status, 0, `${name}: CLI failed; see ${evidence}`)
      const report = JSON.parse(
        readFileSync(join(evidence, 'report.json'), 'utf8')
      )
      const actual = {
        cases: report.testResults.flatMap((file) =>
          file.assertionResults.map((test) => ({
            name: test.fullName,
            state: test.status,
          }))
        ),
        rows: readFileSync(trace, 'utf8')
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line)),
        summary: Object.fromEntries(
          Object.entries(report).filter(
            ([key]) => key.startsWith('num') || key === 'success'
          )
        ),
      }
      save(evidence, 'actual.json', actual)
      assert.deepEqual(
        actual,
        expected.model,
        `${name}: whole author rows, cases, or counts differ from genuine Browser clocks`
      )
      profiles.push({
        name,
        mode,
        engine,
        cases: actual.cases.length,
        wholeAuthorRows: actual.rows.length,
        exactGenuineRowsCasesAndCounts: true,
        actualDOMRealmAsserted: true,
        allOwnersJoined: true,
      })
    } finally {
      if (joined) rmSync(fixture, { recursive: true, force: true })
      save(evidence, 'closure.json', {
        allOwnersJoined: joined,
        fixtureAbsent: !existsSync(fixture),
      })
    }
  }
}
save(output, 'VERIFIED.json', {
  profiles: profiles.length,
  runs: profiles,
  cases: profiles.reduce((sum, p) => sum + p.cases, 0),
  wholeAuthorRows: profiles.reduce((sum, p) => sum + p.wholeAuthorRows, 0),
  exactGenuineRowsCasesAndCounts: true,
  actualDOMRealmAsserted: true,
  allOwnersJoined: true,
  allInputsRemovedAfterOwnedReadersJoined: true,
})
