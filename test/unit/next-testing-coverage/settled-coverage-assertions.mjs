import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { assertCoverageCounters } from './snapshot-coverage-assertions.mjs'

export { assertCoverageCounters }

// Collection/hook failure tests verify that all settled hits reach the reports.
// Exact source positions and reporter text have separate mapping/format tests.
export function assertCoverageReports(directory, fixture, expected, files) {
  assert.deepEqual(readdirSync(directory).sort(), files.slice().sort())
  const map = JSON.parse(readFileSync(join(directory, 'coverage-final.json')))
  assertCoverageCounters(map, fixture, expected)
  const summary = JSON.parse(
    readFileSync(join(directory, 'coverage-summary.json'))
  )
  const sourceName = (name) =>
    (name.startsWith(fixture) ? relative(fixture, name) : name)
      .split(sep)
      .join('/')
  assert.deepEqual(
    Object.keys(summary)
      .filter((name) => name !== 'total')
      .map(sourceName)
      .sort(),
    Object.keys(expected).sort()
  )
  for (const metric of ['statements', 'functions', 'branches']) {
    const hits = Object.values(expected).flatMap((file) => file[metric].flat())
    assert.equal(summary.total[metric].total, hits.length)
    assert.equal(
      summary.total[metric].covered,
      hits.filter((hit) => hit > 0).length
    )
  }
  const lcov = readFileSync(join(directory, 'lcov.info'), 'utf8')
  assert.deepEqual(
    lcov
      .split('\n')
      .filter((line) => line.startsWith('SF:'))
      .map((line) => sourceName(line.slice(3)))
      .sort(),
    Object.keys(expected).sort()
  )
}
