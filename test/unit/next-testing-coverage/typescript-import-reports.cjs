const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const repo = path.resolve(__dirname, '../../..')
const sources = path.join(__dirname, 'fixtures/typescript-imports')
let completeReports = 0
for (const name of [
  'methods',
  'plain',
  'declare',
  'unexecuted',
  'selected-js',
  'unselected-js',
  'jsx-plan',
])
  for (const mode of ['development', 'production']) {
    const source = path.join(sources, name)
    const fixture = fs.mkdtempSync(
      path.join(repo, '.next-test-typescript-imports-')
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
              name: 'typescript-imports',
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
          ...(name === 'selected-js'
            ? ['*.ts', '*.js']
            : name === 'unselected-js'
              ? ['subject.ts']
              : name === 'jsx-plan'
                ? ['*.ts', '*.jsx']
                : ['*.ts']
          ).map((pattern) => '--coverage.include=' + pattern),
        ],
        { cwd: fixture, env, encoding: 'utf8', timeout: 40000 }
      )
      assert.equal(child.error, undefined)
      assert.equal(child.signal, null)
      assert.equal(child.status, 0, child.stdout + child.stderr)
      const result = JSON.parse(
        fs.readFileSync(path.join(fixture, 'result.json'))
      )
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
      const canonical = Object.fromEntries(
        Object.entries(report).map(([file, value]) => [
          path.basename(file),
          { ...value, path: path.basename(file) },
        ])
      )
      assert.deepEqual(
        canonical,
        JSON.parse(
          fs.readFileSync(path.join(source, mode, 'pristine-coverage.json'))
        )
      )
      for (const file of fs
        .readdirSync(source)
        .filter((file) => file.endsWith('.txt'))
        .map((file) => file.slice(0, -4)))
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
    profiles: 14,
    cases: 14,
    completeReports,
    genuineReports: 14,
  }) + '\n'
)
