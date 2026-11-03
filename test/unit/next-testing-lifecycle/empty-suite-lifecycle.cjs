const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const repo = path.resolve(__dirname, '../../..')
const next = path.resolve(process.argv[2] ?? path.join(repo, 'packages/next'))
const { createCollector } = require(
  path.join(next, 'dist/experimental/testing/runner/collector.js')
)
const { runCollected } = require(
  path.join(next, 'dist/experimental/testing/runner/lifecycle.js')
)
const { relative } = require(
  path.join(next, 'dist/experimental/testing/client/task-path.js')
)
const inputs = path.join(__dirname, 'empty-suite-records')
const reference = JSON.parse(
  fs.readFileSync(path.join(inputs, 'reference.json'))
)

async function main() {
  const rows = []
  for (const [name, expected] of Object.entries(reference.scenarios)) {
    const source = fs.readFileSync(path.join(inputs, expected.source))
    assert.equal(
      createHash('sha256').update(source).digest('hex'),
      expected.sourceSHA256
    )
    const c = createCollector('empty-local:contract.test.mjs')
    const trace = []
    const suites = []
    // The three-line genuine fixture prelude supplies only imports and trace I/O.
    // Keep every declaration, callback and literal in its original authored body.
    const authoredBody = source.toString().split('\n').slice(3).join('\n')
    new Function(
      'api',
      'trace',
      'const {test,describe,beforeAll,afterAll,aroundAll}=api;\n' + authoredBody
    )(c.api, (...row) => trace.push(row))
    await c.settle()
    const result = await runCollected(
      c.close(),
      {
        runId: 'empty-local',
        signal: new AbortController().signal,
        filePath: '/owned/sub/deep/contract.test.mjs',
        projectDir: '/owned',
        prepareEmptyPublicFile: true,
        finalizePublicTaskModes: true,
        finalizeFocusedPublicTaskModes: true,
        ...expected.options,
        onSuiteEnd(suite) {
          suites.push({
            name:
              suite.suiteId === 'empty-local:contract.test.mjs'
                ? 'ROOT'
                : suite.name,
            mode: suite.mode,
            status: suite.status,
            errors: suite.errors.map(({ error }) =>
              String(error?.message ?? error).replace(
                /^No test suite found in file \/owned\//,
                'No test suite found in file $FIXTURE/'
              )
            ),
          })
        },
      },
      () => {}
    )
    const actual = {
      suites,
      cases: result.cases.map(({ name, status }) => ({ name, status })),
      trace,
    }
    const { standardReport: _standardReport, ...model } = expected.model
    assert.deepEqual(actual, model, name)
    rows.push({ name, ...actual })
  }
  const paths = [
    [
      '/owned',
      '/owned/sub/deep/contract.test.mjs',
      'sub/deep/contract.test.mjs',
    ],
    ['/owned/sub', '/owned/other.test.mjs', '../other.test.mjs'],
    ['/', '/owned/contract.test.mjs', 'owned/contract.test.mjs'],
    ['/owned', '/owned', ''],
    [
      '/owned/sub/deep',
      '/other/contract.test.mjs',
      '../../../other/contract.test.mjs',
    ],
    ['/owned/', '/owned/contract.test.mjs', 'contract.test.mjs'],
  ]
  for (const [from, to, expected] of paths)
    assert.equal(relative(from, to), expected)
  process.stdout.write(
    JSON.stringify({
      runtime: process.version,
      referenceVersion: reference.referenceVersion,
      scenarios: rows.length,
      pathCases: paths.length,
      emptySuitesPreserveDescendants: true,
      hooksAndOriginalFailuresPreserved: true,
      passWithNoTestsIncludesNestedSuites: true,
      projectRelativeNoTestsFileName: true,
      rows,
    }) + '\n'
  )
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
