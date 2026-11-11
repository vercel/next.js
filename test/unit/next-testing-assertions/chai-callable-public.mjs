import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
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
import { readFixture, expectedCases } from './chai-callable.cjs'

export async function runPublic(kind) {
  const [lane, project, output, mode, extension = 'mjs', family = 'default'] =
    process.argv.slice(2)
  assert(['source', 'installed'].includes(lane))
  assert(['development', 'production'].includes(mode))
  assert(['js', 'mjs'].includes(extension))
  assert(project && output && !existsSync(output))
  mkdirSync(output, { recursive: true })
  const body = readFixture(kind, family)
  const req = createRequire(join(project, 'package.json'))
  const next = dirname(req.resolve('next/package.json'))
  const fixture = mkdtempSync(join(project, `.next-test-chai-${kind}-`))
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
    assertOwnedNodeCompleted(result, 'public Chai callable ' + kind)
    assert.equal(result.status, 0, result.stderr)
    const report = JSON.parse(readFileSync(reportPath, 'utf8'))
    assert.equal(report.success, true)
    assert.equal(report.numTotalTests, expectedCases(kind, family))
    assert.equal(report.numPassedTests, report.numTotalTests)
    assert.equal(report.numFailedTests, 0)
    const cases = report.testResults.flatMap((file) => file.assertionResults)
    assert.equal(cases.length, report.numTotalTests)
    assert(
      cases.every(
        (value) =>
          value.status === 'passed' && value.failureMessages.length === 0
      )
    )
    writeFileSync(
      join(output, 'VERIFIED.json'),
      JSON.stringify(
        {
          lane,
          mode,
          extension,
          cases: cases.length,
          behaviorAssertions: true,
          originalBoundsHeld: true,
          allOwnersJoined: true,
        },
        null,
        2
      ) + '\n'
    )
    console.log(
      JSON.stringify({
        lane,
        mode,
        extension,
        cases: cases.length,
        behaviorAssertions: true,
        allOwnersJoined: true,
      })
    )
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
}
