import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  existsSync,
} from 'node:fs'
import { join, dirname, basename } from 'node:path'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from './process-supervisor.mjs'
const [consumer, output, mode = 'development'] = process.argv.slice(2)
assert(consumer && output && ['development', 'production'].includes(mode))
const require = createRequire(join(consumer, 'package.json'))
for (const name of ['vitest', 'vite', '@vitest/mocker'])
  assert.throws(() => require.resolve(name))
const cli = require.resolve('next/dist/bin/next')
const profiles = JSON.parse(
  readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      'fixtures/public-unexecuted-cases/pristine.json'
    ),
    'utf8'
  )
)
assert(!existsSync(output))
mkdirSync(output, { recursive: true })
const attributes = (text) =>
  Object.fromEntries(
    [...text.matchAll(/([\w:-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]])
  )
const junitProjection = (xml) => {
  const suite = /<testsuite\b([^>]*)>/.exec(xml)
  assert(suite)
  const attrs = attributes(suite[1])
  return {
    suiteCounts: Object.fromEntries(
      ['tests', 'failures', 'errors', 'skipped'].map((k) => [k, attrs[k]])
    ),
    testcases: [
      ...xml.matchAll(/<testcase\b([^>]*)>([\s\S]*?)<\/testcase>/g),
    ].map((m) => ({
      attributes: Object.fromEntries(
        Object.entries(attributes(m[1])).filter(([k]) => k !== 'time')
      ),
      children: [...m[2].matchAll(/<([\w:-]+)(?:\s|\/?>)/g)].map((m) => m[1]),
    })),
  }
}
const checks = []
for (const { profile, source, reporter, config, expected: byMode } of profiles)
  for (const variant of ['custom-json', 'json-only', 'junit-only']) {
    const expected = byMode[mode][variant],
      out = join(output, profile + '-' + variant),
      fixture = join(consumer, '.next-test-unexecuted-' + randomUUID())
    mkdirSync(out)
    mkdirSync(fixture)
    writeFileSync(
      join(fixture, 'package.json'),
      '{"private":true,"type":"module"}\n'
    )
    writeFileSync(join(fixture, 'modes.case.mjs'), source)
    writeFileSync(join(fixture, 'reporter.mjs'), reporter)
    writeFileSync(
      join(fixture, 'vitest.config.mjs'),
      'export default ' +
        JSON.stringify({ test: { ...config.test, mode } }) +
        '\n'
    )
    const env = {
      ...process.env,
      NODE_ENV: mode,
      CI: '1',
      FORCE_COLOR: '0',
      NEXT_TELEMETRY_DISABLED: '1',
      TURBO_TASKS_AVAILABLE_PARALLELISM: '4',
      MODE_TRACE: join(out, 'trace.jsonl'),
    }
    delete env.NODE_OPTIONS
    delete env.NODE_PATH
    try {
      const machine = variant === 'junit-only' ? 'junit' : 'json',
        target = join(out, machine === 'json' ? 'cases.json' : 'junit.xml')
      const result = await runOwnedNode(
        [
          cli,
          'test',
          fixture,
          ...(variant === 'custom-json' ? ['--reporter=./reporter.mjs'] : []),
          '--reporter=' + machine,
          '--outputFile=' + target,
        ],
        { cwd: fixture, env, auditDir: join(out, 'owners'), timeoutMs: 120000 }
      )
      writeFileSync(
        join(out, 'RESULT.json'),
        JSON.stringify(result, null, 2) + '\n'
      )
      writeFileSync(join(out, 'stdout.log'), result.stdout)
      writeFileSync(join(out, 'stderr.log'), result.stderr)
      assertOwnedNodeCompleted(
        result,
        'actual unexecuted case ' + profile + ' ' + mode + ' ' + variant
      )
      assert.equal(result.status, 0, result.stderr)
      const trace = readFileSync(join(out, 'trace.jsonl'), 'utf8')
        .trim()
        .split('\n')
        .map(JSON.parse)
      assert.deepEqual(
        trace.filter((r) => r.actor === 'reporter'),
        expected.reporterRows
      )
      assert.deepEqual(
        trace.filter((r) => r.actor === 'author'),
        expected.authoredRows
      )
      if (machine === 'json') {
        const json = JSON.parse(readFileSync(target, 'utf8')),
          stable = {
            counts: Object.fromEntries(
              Object.entries(json).filter(
                ([k]) => k.startsWith('num') || k === 'success'
              )
            ),
            snapshot: json.snapshot,
            files: json.testResults.map((f) => ({
              name: basename(f.name),
              status: f.status,
              message: f.message,
              assertionResults: f.assertionResults.map(
                ({ duration, ...a }) => a
              ),
            })),
          }
        assert.deepEqual(stable, expected.stable)
        const ended = json.next.events.filter((e) => e.type === 'case-end')
        assert.equal(ended.length, 1)
        assert.equal(ended[0].unexecuted, true)
        assert.equal(ended[0].mode, 'run')
        assert.equal(ended[0].status, 'skipped')
        assert.equal(ended[0].durationMs, 0)
        assert.equal(ended[0].attempt.retry, 0)
        assert.equal(ended[0].attempt.repeat, 0)
        assert.deepEqual(ended[0].errors, [])
        assert.equal(
          json.next.events.some(
            (e) => e.type === 'case-start' && e.caseId === ended[0].caseId
          ),
          false
        )
        assert.equal(
          Object.hasOwn(json.testResults[0].assertionResults[0], 'duration'),
          false
        )
      } else
        assert.deepEqual(
          junitProjection(readFileSync(target, 'utf8')),
          expected.junitCaseAndCountProjection
        )
      checks.push({
        profile,
        variant,
        wholeReporterAndAuthorStreamsExact: true,
        completeStableJsonAndSnapshotExact: machine === 'json',
        junitCaseAndCountProjectionExact: machine === 'junit',
        wholeJunitReportEqualityClaim: false,
        allOwnersJoined: true,
      })
      writeFileSync(
        join(out, 'OBSERVED.json'),
        JSON.stringify(checks.at(-1), null, 2) + '\n'
      )
    } finally {
      rmSync(fixture, { recursive: true, force: true })
    }
  }
writeFileSync(
  join(output, 'VERIFIED.json'),
  JSON.stringify(
    {
      mode,
      profiles: checks.length,
      checks,
      allOwnersJoined: true,
      allInputsRemovedAfterOwnedReadersJoined: true,
      editorBlobShardProjectionsQualified: false,
    },
    null,
    2
  ) + '\n'
)
