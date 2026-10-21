const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const repo = path.resolve(__dirname, '../../..')
const sources = path.join(__dirname, 'fixtures/computed-callbacks')
let cases = 0
let completeReports = 0
for (const name of ['literal', 'identifier']) {
  for (const mode of ['development', 'production']) {
    const source = path.join(sources, name)
    const fixture = fs.mkdtempSync(
      path.join(repo, '.next-test-callback-coverage-')
    )
    try {
      for (const file of fs.readdirSync(source)) {
        fs.copyFileSync(
          path.join(source, file),
          path.join(fixture, file.replace(/\.txt$/, ''))
        )
      }
      fs.writeFileSync(
        path.join(fixture, 'next.config.mjs'),
        'export default {}\n'
      )
      fs.writeFileSync(
        path.join(fixture, 'next.test.config.json'),
        JSON.stringify({
          projects: [
            {
              name: 'computed-callbacks',
              environment: 'node',
              mode,
              include: ['contract.test.mjs'],
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
        fs.readFileSync(path.join(fixture, 'result.json'), 'utf8')
      )
      assert.equal(child.status, 0, JSON.stringify(result))
      assert.equal(result.numPassedTests, 1)
      assert.equal(result.success, true)
      assert.deepEqual(
        result.testResults.flatMap((file) =>
          file.assertionResults.map(
            ({ fullName, status, failureMessages }) => ({
              fullName,
              status,
              failureMessages,
            })
          )
        ),
        JSON.parse(fs.readFileSync(path.join(source, 'pristine-cases.json')))
      )
      const report = JSON.parse(
        fs.readFileSync(path.join(fixture, 'coverage/coverage-final.json'))
      )
      assert.deepEqual(Object.keys(report), [path.join(fixture, 'subject.ts')])
      const data = report[path.join(fixture, 'subject.ts')]
      data.path = '<subject.ts>'
      assert.deepEqual(
        data,
        JSON.parse(fs.readFileSync(path.join(source, 'pristine-coverage.json')))
      )
      for (const file of ['subject.ts', 'contract.test.mjs', 'package.json']) {
        assert.deepEqual(
          fs.readFileSync(path.join(fixture, file)),
          fs.readFileSync(path.join(source, file + '.txt'))
        )
      }
      cases++
      completeReports++
    } finally {
      fs.rmSync(fixture, { recursive: true, force: true })
    }
  }
}
process.stdout.write(
  JSON.stringify({ profiles: 4, cases, completeReports }) + '\n'
)
