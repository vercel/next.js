import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
const [lane, project, output, mode, extension = 'mjs', family = 'default'] =
  process.argv.slice(2)
assert(['source', 'installed'].includes(lane))
assert(['development', 'production'].includes(mode))
assert(extension === 'ts')
assert(['dispatch', 'classes', 'null', 'unchanged'].includes(family))
assert(project && output && !existsSync(output))
mkdirSync(output, { recursive: true })
const here = dirname(fileURLToPath(import.meta.url)),
  inputs = join(here, 'fixtures/chai-receivers', family)
const reference = undefined
const body = readFileSync(join(inputs, 'runtime.test.ts.txt'), 'utf8')
const req = createRequire(join(project, 'package.json')),
  next = dirname(req.resolve('next/package.json'))
const fixture = mkdtempSync(join(project, '.next-test-chai-receivers-'))
try {
  const entry = 'probe.test.' + extension
  writeFileSync(
    join(fixture, 'package.json'),
    JSON.stringify({ private: true, type: 'module' })
  )
  writeFileSync(join(fixture, entry), body)
  writeFileSync(
    join(fixture, 'vitest.config.mjs'),
    `export default{test:{mode:${JSON.stringify(mode)},include:[${JSON.stringify(entry)}],fileParallelism:false,maxWorkers:1,cache:false,testTimeout:5000,hookTimeout:5000}}\n`
  )
  const reportPath = join(output, 'cases.json')
  const result = await runOwnedNode(
    [
      join(next, 'dist/bin/next'),
      'test',
      fixture,
      '--reporter=json',
      '--outputFile=' + reportPath,
    ],
    {
      cwd: project,
      env: {
        ...process.env,
        NODE_ENV: mode,
        CI: '1',
        NEXT_TELEMETRY_DISABLED: '1',
      },
      timeoutMs: 120000,
      auditDir: join(output, 'owners'),
    }
  )
  writeFileSync(join(output, 'stdout.log'), result.stdout)
  writeFileSync(join(output, 'stderr.log'), result.stderr)
  assertOwnedNodeCompleted(result, 'public Chai receivers')
  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(readFileSync(reportPath, 'utf8')),
    cases = report.testResults.flatMap((file) => file.assertionResults)
  assert.equal(report.success, true)
  assert.equal(
    report.numTotalTests,
    { dispatch: 28, classes: 24, null: 16, unchanged: 1 }[family]
  )
  assert.equal(cases.length, report.numTotalTests)
  assert.equal(report.numPassedTests, report.numTotalTests)
  assert.equal(report.numFailedTests, 0)
  assert(
    cases.every(
      (value) => value.status === 'passed' && value.failureMessages.length === 0
    )
  )
  if (reference) {
    const rows = report.next.events
      .filter((event) => event.type === 'output')
      .flatMap((event) => event.text.split('\n'))
      .filter((line) => line.startsWith('POLL_OWNERSHIP_ROW '))
      .map((line) => JSON.parse(line.slice(19)))
    assert.deepEqual(rows, reference.rows)
  }
  const facts = {
    lane,
    mode,
    extension,
    cases: cases.length,
    behaviorAssertions: true,
    allOwnersJoined: true,
  }
  writeFileSync(
    join(output, 'VERIFIED.json'),
    JSON.stringify(facts, null, 2) + '\n'
  )
  console.log(JSON.stringify(facts))
} finally {
  rmSync(fixture, { recursive: true, force: true })
  writeFileSync(
    join(output, 'CLOSURE.json'),
    JSON.stringify({
      fixtureAbsent: !existsSync(fixture),
      originalBoundsHeld: true,
    }) + '\n'
  )
}
