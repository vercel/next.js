const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const repo = path.resolve(__dirname, '../../..')
const sources = path.join(
  __dirname,
  'fixtures/parameter-property-literal-calls'
)
async function main() {
  const { runOwnedNode, assertOwnedNodeCompleted } = await import(
    repo + '/test/e2e/app-dir/next-testing-package/process-supervisor.mjs'
  )
  let completeReports = 0
  for (const name of ['executed', 'untouched'])
    for (const mode of ['development', 'production']) {
      const source = path.join(sources, name)
      const fixture = fs.mkdtempSync(
        path.join(repo, '.next-test-parameter-property-literal-calls-')
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
                name: 'parameter-property-literal-calls',
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
        const child = await runOwnedNode(
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
          {
            cwd: fixture,
            env,
            auditDir: path.join(fixture, '.owned-processes'),
            timeoutMs: 40000,
          }
        )
        assertOwnedNodeCompleted(child, name + ':' + mode)
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
        assert.deepEqual(Object.keys(report), [
          path.join(fixture, 'subject.ts'),
        ])
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
      profiles: 4,
      cases: 4,
      completeReports,
      genuineReports: 4,
    }) + '\n'
  )
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
