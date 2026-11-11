import { readCoverageFixture } from './coverage-fixtures.cjs'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const [consumerArg, outputArg, profile] = process.argv.slice(2)
assert(consumerArg && outputArg && profile)
const consumer = resolve(consumerArg)
const output = resolve(outputArg)
const here = dirname(fileURLToPath(import.meta.url))
const pristine = readCoverageFixture(
  join(here, 'fixtures/istanbul-provider/json-map-pristine.json')
)
const row = pristine.rows.find((row) => row.name === profile)
assert(row, 'Unknown prepared JSON coverage map profile')
execFileSync(
  process.execPath,
  [
    join(here, 'istanbul-public-reports.mjs'),
    consumer,
    output,
    profile,
    ...(process.argv.includes('--source') ? ['--source'] : []),
  ],
  { encoding: 'utf8', timeout: 125000 }
)
const checks = JSON.parse(readFileSync(join(output, 'CHECKS.json')))
assert(checks.ownedProcessTreeClosed && checks.actualPublicCLI)
const report = JSON.parse(readFileSync(join(output, 'cases.json')))
const root = dirname(report.testResults[0].name)
const canonical = (data) =>
  JSON.parse(JSON.stringify(data).replaceAll(root, '<PROJECT_ROOT>'))
assert.equal(Object.hasOwn(report, 'coverageMap'), row.coverageMapPresent)
if (row.coverageMapPresent)
  assert.deepEqual(canonical(report.coverageMap), row.coverageMap)
writeFileSync(
  join(output, 'JSON-MAP-CHECKS.json'),
  JSON.stringify(
    {
      profile,
      actualPublicCLI: true,
      exactPreparedCoverageMap: true,
      coverageMapPresent: row.coverageMapPresent,
      preservedCaseAndCoverageAssetChecks: true,
      originalOwnedProcessChecksPassed: true,
    },
    null,
    2
  ) + '\n'
)
