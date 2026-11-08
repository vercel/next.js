import { readExpectedCoverageFixture } from './expected-coverage-fixtures.cjs'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runCompilerCase } from '../../lib/next-testing-case-runner.mjs'

const [repoArg, outputArg, mode = 'production', shapeArg] =
  process.argv.slice(2)
assert(repoArg && outputArg)
assert.equal(mode, 'production')
const repo = resolve(repoArg),
  output = resolve(outputArg)
const here = dirname(fileURLToPath(import.meta.url))
const expected = JSON.parse(
  readFileSync(
    join(here, 'fixtures/browser-production/shapes.expected.json'),
    'utf8'
  )
)
const portable = (name) => name.split(sep).join('/')
const lines = (data) => {
  const result = {}
  for (const [id, location] of Object.entries(data.statementMap)) {
    const line = location.start.line
    result[line] = Math.max(result[line] ?? 0, data.s[id])
  }
  return result
}
const describe = (data) => ({
  lines: lines(data),
  statements: Object.values(data.s),
  functions: Object.entries(data.fnMap).map(([id, fn]) => ({
    name: fn.name,
    line: fn.decl.start.line,
    hits: data.f[id],
  })),
  branches: Object.entries(data.branchMap).map(([id, branch]) => ({
    type: branch.type,
    line: branch.loc.start.line,
    hits: data.b[id],
  })),
})
function sourceFiles(shape) {
  let root = join(here, 'fixtures/browser-production', shape)
  let names
  if (shape === 'javascript' || shape === 'typescript') {
    root = join(
      here,
      '../app-dir/next-testing-stable-release-gaps/fixtures',
      shape === 'javascript'
        ? 'coverage-browser'
        : 'coverage-compiler-source-typescript'
    )
    names =
      shape === 'javascript'
        ? ['contract.case.mjs', 'subject.mjs', 'unimported.mjs', 'excluded.mjs']
        : ['contract.case.mjs', 'subject.ts']
  } else if (shape === 'fragment' || shape === 'unimported') {
    root = join(here, 'fixtures/jsx-owners-public/fragment')
    names = [
      'contract.test.mjs',
      'subject.tsx',
      'helper.js',
      'package.json',
    ].map((name) => name + '.txt')
  } else names = readdirSync(root).filter((name) => name.endsWith('.txt'))
  const files = names.map((name) => ({
    target: shape + '/' + name.replace(/\.txt$/, ''),
    bytes: readFileSync(join(root, name), 'utf8'),
  }))
  if (shape === 'unimported')
    files.push({
      target: 'unimported/unimported.tsx',
      bytes: readFileSync(join(root, 'subject.tsx.txt'), 'utf8'),
    })
  return files
}
function assertLocations(data, source) {
  const sourceLines = source.split(/\r?\n/)
  const range = (location) => {
    for (const point of [location.start, location.end]) {
      if (Object.keys(point).length === 0) continue
      assert(
        Number.isSafeInteger(point.line) &&
          point.line > 0 &&
          point.line <= sourceLines.length
      )
      if (point.column !== null)
        assert(
          Number.isSafeInteger(point.column) &&
            point.column >= 0 &&
            point.column <= sourceLines[point.line - 1].length
        )
    }
  }
  Object.values(data.statementMap).forEach(range)
  Object.values(data.fnMap).forEach((fn) => {
    range(fn.decl)
    range(fn.loc)
  })
  Object.values(data.branchMap).forEach((branch) => {
    range(branch.loc)
    branch.locations.forEach(range)
  })
}
const all =
  shapeArg === 'threshold'
    ? ['unimported']
    : shapeArg
      ? [shapeArg]
      : Object.keys(expected)
assert(all.every((shape) => Object.hasOwn(expected, shape)))
async function run(shape, threshold) {
  const shapes = [shape]
  const reports =
    shape === 'classic' || threshold
      ? ['json', 'json-summary', 'lcovonly']
      : ['json']
  const files = sourceFiles(shape).map((file) => ({
    ...file,
    target: file.target.slice(shape.length + 1),
  }))
  const entries = files
    .filter(({ target }) => /\.(?:test|case)\.mjs$/.test(target))
    .map(({ target }) => target)
  const coverage = Object.fromEntries(
    shapes.flatMap((shape) =>
      Object.entries(expected[shape].coverage).map(([file, value]) => [
        file,
        value,
      ])
    )
  )
  const count = shapes.reduce(
    (sum, shape) => sum + expected[shape].cases.length,
    0
  )
  files.push(
    {
      target: 'app/layout.jsx',
      bytes:
        'export default function Layout({children}){return <html><body>{children}</body></html>}\n',
    },
    {
      target: 'app/page.jsx',
      bytes: 'export default function Page(){return <p>Coverage shapes</p>}\n',
    },
    {
      target: 'next.config.mjs',
      bytes:
        'export default ' +
        JSON.stringify({
          turbopack: { root: repo },
          experimental: { turbopackSharedRuntime: true },
        }) +
        '\n',
    }
  )
  return runCompilerCase({
    repo,
    output: join(output, threshold ? 'threshold' : shape),
    mode,
    files,
    expectedCount: count,
    expectedExit: threshold ? 1 : 0,
    timeoutMs: 240000,
    config: {
      test: {
        maxWorkers: 1,
        mode,
        include: entries,
        browser: { enabled: true, headless: true },
        coverage: {
          provider: 'v8',
          enabled: true,
          include: Object.keys(coverage),
          exclude: [],
          reportsDirectory: 'coverage',
          reporter: reports,
          ...(threshold ? { thresholds: { 100: true } } : {}),
        },
      },
    },
    ...(threshold
      ? {
          checkOutcomes(report) {
            assert.equal(report.success, true)
            assert.equal(report.next.summary.errors, 0)
            assert.deepEqual(
              report.next.events.filter(
                (event) =>
                  event.type === 'diagnostic' &&
                  event.diagnostic.severity === 'error'
              ),
              []
            )
            assert(report.testResults.every((file) => file.message === ''))
            assert.equal(report.numPassedTests, count)
            assert.equal(report.numFailedTests, 0)
            assert(report.testResults.every((file) => file.status === 'passed'))
            assert(
              report.testResults
                .flatMap((file) => file.assertionResults)
                .every(
                  (test) =>
                    test.status === 'passed' &&
                    test.failureMessages.length === 0
                )
            )
          },
        }
      : {}),
    check(report, { fixture, stdout, stderr }) {
      const actual = Object.fromEntries(
        Object.entries(
          JSON.parse(
            readFileSync(join(fixture, 'coverage/coverage-final.json'), 'utf8')
          )
        ).map(([file, data]) => [portable(relative(fixture, file)), data])
      )
      assert.deepEqual(Object.keys(actual).sort(), Object.keys(coverage).sort())
      for (const [file, reference] of Object.entries(coverage)) {
        assert.deepEqual(describe(actual[file]), reference, file)
        assertLocations(actual[file], readFileSync(join(fixture, file), 'utf8'))
      }
      for (const shape of shapes) {
        for (const [file, groups] of Object.entries(
          expected[shape].coordinates
        )) {
          const data = actual[file]
          for (const [group, entries] of Object.entries(groups)) {
            const map =
              group === 'statements'
                ? data.statementMap
                : group === 'functions'
                  ? data.fnMap
                  : data.branchMap
            for (const [id, expectedRange] of Object.entries(entries)) {
              const location =
                group === 'functions' || group === 'branches'
                  ? map[id].loc
                  : map[id]
              assert.deepEqual(
                [
                  location.start.line,
                  location.start.column,
                  location.end.line,
                  location.end.column,
                ],
                expectedRange,
                shape + '/' + file + ' ' + group
              )
            }
          }
        }
      }
      assert.deepEqual(
        report.testResults
          .flatMap((file) => file.assertionResults.map((test) => test.fullName))
          .sort(),
        shapes.flatMap((shape) => expected[shape].cases).sort()
      )
      if (shapes.includes('classic')) {
        const full = readExpectedCoverageFixture(
          join(here, 'fixtures/browser-production/classic.expected.json')
        ).coverage['layout-classic.tsx']
        assert.deepEqual(
          { ...actual['layout-classic.tsx'], path: 'layout-classic.tsx' },
          full
        )
      }
      if (reports.length > 1) {
        const summary = JSON.parse(
          readFileSync(join(fixture, 'coverage/coverage-summary.json'), 'utf8')
        )
        const metric = (hits) => ({
          total: hits.length,
          covered: hits.filter((value) => value > 0).length,
        })
        const total = { lines: [], functions: [], statements: [], branches: [] }
        for (const [file, data] of Object.entries(actual)) {
          const counts = {
            lines: Object.values(lines(data)),
            functions: Object.values(data.f),
            statements: Object.values(data.s),
            branches: Object.values(data.b).flat(),
          }
          const row = summary[join(fixture, file)]
          assert(row, file)
          for (const [name, hits] of Object.entries(counts)) {
            assert.equal(row[name].total, metric(hits).total)
            assert.equal(row[name].covered, metric(hits).covered)
            total[name].push(...hits)
          }
        }
        for (const [name, hits] of Object.entries(total)) {
          assert.equal(summary.total[name].total, metric(hits).total)
          assert.equal(summary.total[name].covered, metric(hits).covered)
        }
        const lcov = readFileSync(join(fixture, 'coverage/lcov.info'), 'utf8')
        const records = lcov
          .trim()
          .split('end_of_record')
          .filter((record) => record.trim())
        assert.equal(records.length, Object.keys(coverage).length)
        for (const record of records) {
          const source = record.match(/^SF:(.*)$/m)?.[1]
          assert(source)
          const file = portable(
            source.startsWith(fixture) ? relative(fixture, source) : source
          )
          assert(coverage[file], source)
          const lineHits = Object.fromEntries(
            [...record.matchAll(/^DA:(\d+),(\d+)/gm)].map((match) => [
              match[1],
              Number(match[2]),
            ])
          )
          assert.deepEqual(lineHits, coverage[file].lines)
        }
      }
      if (threshold)
        for (const metric of ['lines', 'functions', 'statements', 'branches'])
          assert((stdout + stderr).includes('Coverage for ' + metric), metric)
    },
  })
}
if (shapeArg !== 'threshold') for (const shape of all) await run(shape)
if (!shapeArg || shapeArg === 'threshold') await run('unimported', true)
console.log(
  JSON.stringify({
    mode,
    groups: all.length,
    cases: all.reduce((sum, shape) => sum + expected[shape].cases.length, 0),
    coveredFiles: all.reduce(
      (sum, shape) => sum + Object.keys(expected[shape].coverage).length,
      0
    ),
    thresholdFailure: !shapeArg || shapeArg === 'threshold',
  })
)
