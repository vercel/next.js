import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { runCompilerCase } from '../../../lib/next-testing-case-runner.mjs'

/** Browser fixtures assert interactions directly; the outer check covers execution. */
export async function runBrowserCases({
  consumer,
  output,
  mode,
  files,
  expectedCases,
  failures = [],
  fileTimeout = 60000,
  timeoutMs = 120000,
  browser = 'chromium',
}) {
  const testFiles = files
    .map(({ target }) => target)
    .filter((target) => target.endsWith('.test.mjs'))
  const result = await runCompilerCase({
    repo: consumer,
    output,
    mode,
    files: [
      ...files.map(({ source, target }) => ({
        target,
        bytes: readFileSync(source),
      })),
      {
        target: 'app/layout.jsx',
        bytes:
          "import React from 'react';export default function Layout({children}) { return <html><body>{children}</body></html> }\n",
      },
      {
        target: 'app/page.jsx',
        bytes:
          'export default function Page() { return <p>Browser regression</p> }\n',
      },
    ],
    expectedCount: expectedCases,
    expectedExit: failures.length ? 1 : 0,
    timeoutMs,
    config: {
      maxWorkers: 1,
      projects: [
        {
          name: 'browser-regression',
          mode,
          environment: 'browser',
          fileTimeout,
          include: testFiles,
          browser: {
            enabled: true,
            headless: true,
            viewport: { width: 640, height: 480 },
            instances: [{ browser }],
          },
        },
      ],
    },
    checkOutcomes(report) {
      const cases = report.testResults.flatMap((file) => file.assertionResults)
      assert.deepEqual(
        report.testResults.map(({ name }) => basename(name)).sort(),
        testFiles.map((name) => basename(name)).sort()
      )
      assert.equal(report.numTotalTests, expectedCases)
      assert.equal(report.numFailedTests, failures.length)
      assert.equal(report.numPassedTests, expectedCases - failures.length)
      assert.equal(report.numPendingTests, 0)
      assert.equal(report.success, failures.length === 0)
      for (const file of report.testResults) {
        assert.equal(file.message, '', file.name)
        assert.equal(
          file.status,
          file.assertionResults.some(({ status }) => status === 'failed')
            ? 'failed'
            : 'passed',
          file.name
        )
      }
      assert.deepEqual(
        report.next.events.filter(
          (event) =>
            event.type === 'diagnostic' && event.diagnostic.severity === 'error'
        ),
        [],
        'Unexpected file or runtime diagnostic'
      )
      assert.equal(report.next.summary.errors, failures.length)
      for (const result of cases) {
        const expectedFailure = failures.find(
          ({ name }) => name === result.fullName
        )
        assert.equal(
          result.status,
          expectedFailure ? 'failed' : 'passed',
          result.fullName
        )
        if (expectedFailure) {
          assert.equal(result.failureMessages.length, 1, result.fullName)
          assert(
            result.failureMessages.some((message) =>
              message.includes(expectedFailure.message)
            ),
            result.fullName
          )
        } else assert.deepEqual(result.failureMessages, [], result.fullName)
      }
      assert.deepEqual(
        cases
          .filter(({ status }) => status === 'failed')
          .map(({ fullName }) => fullName)
          .sort(),
        failures.map(({ name }) => name).sort()
      )
    },
  })
  return {
    mode,
    cases: result.cases,
    passed: expectedCases - failures.length,
    failed: failures.length,
  }
}
