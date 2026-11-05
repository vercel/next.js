const { resolveFixturePath } = require('../../lib/next-testing-fixtures.cjs')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
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
const scenarios = [
  'nested-empty',
  'sibling-empty',
  'mixed-active',
  'empty-hooks',
  'empty-before-error',
  'empty-after-error',
  'empty-around-error',
  'skipped-todo-empty',
  'focused-empty',
  'forbidden-focused-empty',
  'pass-with-no-tests',
  'name-filter-empty',
  'empty-file',
  'pass-empty-file',
  'before-blocked-test',
  'around-blocked-test',
]
function checkSuites(name, suites, cases, trace) {
  const status = Object.fromEntries(
    suites.map((suite) => [suite.name, suite.status])
  )
  const errors = Object.fromEntries(
    suites.map((suite) => [suite.name, suite.errors])
  )
  const traced = trace.map((row) => row[0])
  if (
    name === 'nested-empty' ||
    name === 'empty-hooks' ||
    name === 'sibling-empty'
  ) {
    assert.deepEqual(
      suites.map((suite) => suite.name),
      name === 'sibling-empty'
        ? ['one', 'two', 'ROOT']
        : ['inner', 'outer', 'ROOT']
    )
    assert(
      suites.every((suite) => suite.status === 'failed' && suite.mode === 'run')
    )
    for (const suite of suites)
      assert.deepEqual(suite.errors, [
        'No test found in suite ' +
          (suite.name === 'ROOT' ? 'sub/deep/contract.test.mjs' : suite.name),
      ])
    assert.deepEqual(cases, [])
    assert.deepEqual(
      traced,
      name === 'empty-hooks'
        ? [
            'root around+',
            'root before',
            'outer around+',
            'outer before',
            'inner before',
            'inner after',
            'outer after',
            'outer around-',
            'root after',
            'root around-',
          ]
        : []
    )
  } else if (name === 'mixed-active') {
    assert.deepEqual(status, {
      empty: 'failed',
      outer: 'failed',
      following: 'passed',
      ROOT: 'failed',
    })
    assert.deepEqual(errors.empty, ['No test found in suite empty'])
    assert.deepEqual(errors.outer, [])
    assert.deepEqual(errors.ROOT, [])
    assert(cases.every((test) => test.status === 'passed'))
    assert.deepEqual(
      cases.map((test) => test.name),
      ['root body', 'outer > child body', 'following > following body']
    )
    assert.deepEqual(traced, ['root body', 'child body', 'following body'])
  } else if (name === 'empty-before-error') {
    assert.deepEqual(status, { child: 'skipped', ROOT: 'failed' })
    assert.deepEqual(errors.ROOT, ['root before sentinel'])
    assert.deepEqual(traced, ['root before', 'root after'])
  } else if (name === 'empty-after-error' || name === 'empty-around-error') {
    const stage = name === 'empty-after-error' ? 'after' : 'around'
    assert.deepEqual(status, { child: 'failed', ROOT: 'failed' })
    assert.deepEqual(errors.child, [`child ${stage} sentinel`])
    assert.deepEqual(traced, [`child ${stage}`])
  } else if (name === 'skipped-todo-empty') {
    assert.deepEqual(status, {
      'skip inner': 'skipped',
      'skip parent': 'skipped',
      'todo parent': 'skipped',
      'empty active': 'failed',
      ROOT: 'failed',
    })
    assert.deepEqual(
      suites.slice(0, 3).map((suite) => suite.mode),
      ['skip', 'skip', 'todo']
    )
    assert(suites.slice(0, 3).every((suite) => suite.errors.length === 0))
  } else if (name === 'focused-empty' || name === 'forbidden-focused-empty') {
    assert.equal(status.unfocused, 'skipped')
    assert.equal(status.ROOT, 'failed')
    assert.equal(status.focused, 'failed')
    assert.equal(status.inside, name === 'focused-empty' ? 'failed' : 'skipped')
    if (name === 'focused-empty')
      assert.deepEqual(errors.focused, ['No test found in suite focused'])
    else assert.match(errors.focused[0], /Unexpected \.only modifier/)
  } else if (name === 'pass-with-no-tests' || name === 'pass-empty-file') {
    assert(
      suites.every(
        (suite) => suite.status === 'passed' && suite.errors.length === 0
      )
    )
    assert.deepEqual(cases, [])
    assert.deepEqual(
      traced,
      name === 'pass-empty-file'
        ? []
        : ['root before', 'outer before', 'outer after', 'root after']
    )
  } else if (name === 'name-filter-empty') {
    assert.deepEqual(status, { empty: 'failed', ROOT: 'failed' })
    assert.deepEqual(cases, [{ name: 'excluded', status: 'skipped' }])
    assert.deepEqual(trace, [])
  } else if (name === 'empty-file') {
    assert.deepEqual(status, { ROOT: 'failed' })
    assert.deepEqual(errors.ROOT, [
      'No test suite found in file $FIXTURE/sub/deep/contract.test.mjs',
    ])
  } else {
    assert.equal(status.inside, 'skipped')
    assert.equal(status.blocked, 'failed')
    assert.equal(status.ROOT, 'failed')
    assert.deepEqual(errors.blocked, [
      name === 'before-blocked-test' ? 'setup sentinel' : 'around sentinel',
    ])
    assert.deepEqual(cases, [
      { name: 'blocked > inside > blocked test', status: 'skipped' },
      { name: 'following', status: 'passed' },
    ])
    assert.deepEqual(
      traced,
      name === 'before-blocked-test'
        ? ['before', 'after', 'following']
        : ['around', 'following']
    )
  }
}

async function main() {
  let completed = 0
  for (const name of scenarios) {
    const source = fs.readFileSync(
      resolveFixturePath(path.join(inputs, `scenarios/${name}.case.mjs.txt`))
    )
    const c = createCollector('empty-local:contract.test.mjs')
    const trace = []
    const suites = []
    // The fixture prelude supplies imports and the trace callback.
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
        ...(name === 'focused-empty' ? { allowOnly: true } : {}),
        ...(name === 'forbidden-focused-empty' ? { allowOnly: false } : {}),
        ...(['pass-with-no-tests', 'pass-empty-file'].includes(name)
          ? { passWithNoTests: true }
          : {}),
        ...(name === 'name-filter-empty' ? { testNamePattern: '^keep$' } : {}),
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
    checkSuites(name, suites, actual.cases, trace)
    completed++
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
      scenarios: completed,
      pathCases: paths.length,
      emptySuitesPreserveDescendants: true,
      hooksAndOriginalFailuresPreserved: true,
      passWithNoTestsIncludesNestedSuites: true,
      projectRelativeNoTestsFileName: true,
    }) + '\n'
  )
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
