const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const repo =
  process.env.NEXT_TEST_COVERAGE_CONSUMER_ROOT ||
  path.resolve(__dirname, '../../..')
const source = path.join(
  __dirname,
  '../app-dir/next-testing-stable-release-gaps/fixtures/custom-coverage-provider'
)
const expected = require('./custom-disable.expected.json')
// Explicit qualification mode keeps enabled-provider support a separate claim.
const profiles = process.argv.includes('--disabled-only')
  ? expected.rows.filter((row) => row.disabled)
  : expected.rows
for (const pristine of profiles) {
  const fixture = fs.mkdtempSync(path.join(repo, '.next-test-custom-disable-'))
  try {
    for (const name of ['contract.case.mjs', 'coverage-provider.mjs'])
      fs.copyFileSync(path.join(source, name), path.join(fixture, name))
    fs.writeFileSync(
      path.join(fixture, 'next.config.mjs'),
      'export default {}\n'
    )
    fs.writeFileSync(
      path.join(fixture, 'next.test.config.json'),
      JSON.stringify({
        test: {
          include: ['contract.case.mjs'],
          mode: pristine.mode,
          coverage: {
            enabled: true,
            provider: 'custom',
            customProviderModule: './coverage-provider.mjs',
          },
        },
      })
    )
    const child = spawnSync(
      process.execPath,
      [
        path.join(repo, 'packages/next/dist/bin/next'),
        'test',
        fixture,
        '--run',
        '--reporter=json',
        '--outputFile=result.json',
        ...(pristine.disabled ? ['--no-coverage'] : []),
      ],
      {
        cwd: fixture,
        env: {
          ...process.env,
          NODE_ENV: pristine.mode,
          NEXT_TELEMETRY_DISABLED: '1',
        },
        encoding: 'utf8',
        timeout: 40000,
      }
    )
    assert.equal(child.error, undefined)
    assert.equal(child.signal, null)
    assert.equal(child.status, pristine.exit, child.stdout + child.stderr)
    const result = JSON.parse(
      fs.readFileSync(path.join(fixture, 'result.json'))
    )
    const cases = result.testResults.flatMap((file) =>
      file.assertionResults.map(({ fullName, status, failureMessages }) => ({
        fullName,
        status,
        failureMessages,
      }))
    )
    assert.deepEqual(cases, pristine.cases)
    const traceFile = path.join(fixture, 'provider-trace.jsonl')
    const trace = fs.existsSync(traceFile)
      ? fs
          .readFileSync(traceFile, 'utf8')
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line.replaceAll(fixture, '<project>')))
      : []
    assert.deepEqual(trace, pristine.providerTrace)
    const reportFile = path.join(fixture, 'custom-coverage.json')
    const report = fs.existsSync(reportFile)
      ? JSON.parse(fs.readFileSync(reportFile))
      : null
    assert.deepEqual(report, pristine.customReport)
    for (const name of ['contract.case.mjs', 'coverage-provider.mjs'])
      assert.deepEqual(
        fs.readFileSync(path.join(fixture, name)),
        fs.readFileSync(path.join(source, name))
      )
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true })
  }
}
process.stdout.write(
  JSON.stringify({
    profiles: profiles.length,
    cases: profiles.length,
    referenceDisabledProfiles: profiles.filter((row) => row.disabled).length,
    preservedEnabledProfiles: profiles.filter((row) => !row.disabled).length,
    customReports: profiles.filter((row) => !row.disabled).length,
  }) + '\n'
)
