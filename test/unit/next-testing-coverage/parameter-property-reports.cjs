const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const repo = path.resolve(__dirname, '../../..')
const sources = path.join(__dirname, 'fixtures/parameter-properties')
let completeReports = 0
for (const name of [
  'parameter-property',
  'simple',
  'pair',
  'multiline',
  'mixed',
])
  for (const mode of ['development', 'production']) {
    const source = path.join(sources, name)
    const fixture = fs.mkdtempSync(
      path.join(repo, '.next-test-parameter-properties-')
    )
    try {
      for (const file of fs.readdirSync(source))
        if (fs.statSync(path.join(source, file)).isFile())
          fs.copyFileSync(
            path.join(source, file),
            path.join(fixture, file.replace(/\.txt$/, ''))
          )
      fs.writeFileSync(
        path.join(fixture, 'next.config.mjs'),
        'export default {}\n'
      )
      fs.writeFileSync(
        path.join(fixture, 'next.test.config.json'),
        JSON.stringify({
          projects: [
            {
              name: 'parameter-properties',
              environment: 'node',
              mode,
              include: ['contract.case.mjs'],
            },
          ],
        })
      )
      const env = {
        ...process.env,
        NODE_ENV: mode,
        NEXT_TELEMETRY_DISABLED: '1',
      }
      delete env.CI
      const child = spawnSync(
        process.execPath,
        [
          path.join(repo, 'packages/next/dist/bin/next'),
          'test',
          fixture,
          '--run',
          '--reporter=json',
          '--outputFile=result.json',
          '--coverage',
          '--coverage.reporter=json',
          '--coverage.include=subject.ts',
        ],
        { cwd: fixture, env, encoding: 'utf8', timeout: 40000 }
      )
      assert.equal(child.error, undefined)
      assert.equal(child.signal, null)
      const result = JSON.parse(
        fs.readFileSync(path.join(fixture, 'result.json'))
      )
      assert.equal(child.status, 0, JSON.stringify(result))
      const cases = (data) =>
        data.testResults.flatMap((file) =>
          file.assertionResults.map(
            ({ fullName, status, failureMessages }) => ({
              fullName,
              status,
              failureMessages,
            })
          )
        )
      assert.deepEqual(
        cases(result),
        cases(
          JSON.parse(
            fs.readFileSync(path.join(source, mode, 'pristine-cases.json'))
          )
        )
      )
      assert.equal(result.numPassedTests, 1)
      assert.equal(result.success, true)
      const report = JSON.parse(
        fs.readFileSync(path.join(fixture, 'coverage/coverage-final.json'))
      )
      assert.deepEqual(Object.keys(report), [path.join(fixture, 'subject.ts')])
      const canonical = Object.fromEntries(
        Object.entries(report).map(([file, data]) => [
          path.basename(file),
          { ...data, path: path.basename(file) },
        ])
      )
      assert.deepEqual(
        canonical,
        JSON.parse(
          fs.readFileSync(path.join(source, mode, 'pristine-coverage.json'))
        )
      )
      for (const file of [
        'subject.ts',
        'contract.case.mjs',
        'helper.js',
        'package.json',
      ])
        if (fs.existsSync(path.join(source, file + '.txt')))
          assert.deepEqual(
            fs.readFileSync(path.join(fixture, file)),
            fs.readFileSync(path.join(source, file + '.txt'))
          )
      completeReports++
    } finally {
      fs.rmSync(fixture, { recursive: true, force: true })
    }
  }
process.stdout.write(
  JSON.stringify({
    profiles: 10,
    cases: 10,
    completeReports,
    genuineReports: 10,
  }) + '\n'
)
