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
const pristine = JSON.parse(
  readFileSync(join(here, 'fixtures/istanbul-provider/json-map-pristine.json'))
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
const standard = structuredClone(report)
delete standard.next
delete standard.coverageMap
delete standard.startTime
for (const file of standard.testResults) {
  delete file.startTime
  delete file.endTime
  delete file.duration
  for (const test of file.assertionResults) delete test.duration
}
let wholeStandardReportEqual = true
try {
  assert.deepEqual(canonical(standard), row.standardReport)
} catch (error) {
  wholeStandardReportEqual = false
  writeFileSync(join(output, 'STANDARD-REPORT-DIFFERENCE.txt'), String(error))
  if (row.assertWholeStandardReport) throw error
}
writeFileSync(
  join(output, 'JSON-MAP-CHECKS.json'),
  JSON.stringify(
    {
      profile,
      actualPublicCLI: true,
      completePreparedMapMatchesGenuine: true,
      coverageMapPresent: row.coverageMapPresent,
      wholeStandardReportEqual,
      wholeStandardReportRequired: row.assertWholeStandardReport,
      preservedCaseAndCoverageAssetChecks: true,
      originalOwnedProcessChecksPassed: true,
      originalFailureMessageDifferencesRetained: !wholeStandardReportEqual,
    },
    null,
    2
  ) + '\n'
)
