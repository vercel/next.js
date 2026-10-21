const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const repo = path.resolve(__dirname, '../../..')
const sources = path.join(__dirname, 'fixtures/jsx-owners-public')
let cases = 0
let completeReports = 0
for (const [name, extension] of [
  ['nested', 'jsx'],
  ['logical', 'tsx'],
  ['arrow', 'tsx'],
]) {
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
              name: 'function-callbacks',
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
          '--coverage.include=subject.' + extension,
          '--coverage.include=helper.js',
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
      assert.deepEqual(
        Object.keys(report).sort(),
        [
          path.join(fixture, 'helper.js'),
          path.join(fixture, 'subject.' + extension),
        ].sort()
      )
      const canonical = Object.fromEntries(
        Object.entries(report).map(([file, data]) => [
          path.basename(file),
          { ...data, path: path.basename(file) },
        ])
      )
      assert.deepEqual(
        canonical,
        JSON.parse(fs.readFileSync(path.join(source, 'pristine-coverage.json')))
      )
      for (const file of [
        'subject.' + extension,
        'helper.js',
        'contract.test.mjs',
        'package.json',
      ]) {
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
  JSON.stringify({ profiles: 6, cases, completeReports }) + '\n'
)
