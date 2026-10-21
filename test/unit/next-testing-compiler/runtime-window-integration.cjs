const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const repository = path.resolve(__dirname, '../../..')
const installation = process.argv[2]
  ? path.resolve(process.argv[2])
  : repository
const source = path.join(__dirname, 'runtime-window')
const next = fs.existsSync(
  path.join(installation, 'packages/next/dist/bin/next')
)
  ? path.join(installation, 'packages/next/dist/bin/next')
  : path.join(installation, 'node_modules/next/dist/bin/next')

;(async () => {
  const { runOwnedNode, assertOwnedNodeCompleted } = await import(
    pathToFileURL(
      path.join(
        repository,
        'test/e2e/app-dir/next-testing-package/process-supervisor.mjs'
      )
    ).href
  )
  const expected = JSON.parse(
    fs.readFileSync(path.join(source, 'pristine.json'), 'utf8')
  )
  let profiles = 0
  for (const mode of ['development', 'production']) {
    const fixture = fs.mkdtempSync(
      path.join(installation, '.next-test-runtime-window-')
    )
    try {
      for (const file of fs.readdirSync(source))
        if (file.endsWith('.txt'))
          fs.copyFileSync(
            path.join(source, file),
            path.join(fixture, file.replace(/\.txt$/, ''))
          )
      fs.symlinkSync(
        path.join(installation, 'node_modules'),
        path.join(fixture, 'node_modules')
      )
      fs.writeFileSync(
        path.join(fixture, 'next.config.mjs'),
        'export default {}\n'
      )
      fs.writeFileSync(
        path.join(fixture, 'next.test.config.json'),
        JSON.stringify({
          maxWorkers: 1,
          projects: [
            {
              name: 'runtime-window',
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
      const result = await runOwnedNode(
        [
          next,
          'test',
          fixture,
          '--run',
          '--reporter=json',
          '--outputFile=result.json',
        ],
        {
          cwd: fixture,
          env,
          auditDir: path.join(fixture, 'processes'),
          timeoutMs: 60000,
        }
      )
      assertOwnedNodeCompleted(result, mode)
      const report = JSON.parse(
        fs.readFileSync(path.join(fixture, 'result.json'), 'utf8')
      )
      assert.equal(result.status, 0, JSON.stringify(report))
      assert.equal(report.success, true)
      assert.equal(report.numPassedTests, 2)
      const cases = report.testResults.flatMap((file) =>
        file.assertionResults.map(({ fullName, status, failureMessages }) => ({
          fullName,
          status,
          failureMessages,
        }))
      )
      const rows = report.next.events
        .filter((event) => event.type === 'output')
        .flatMap((event) => event.text.split('\n'))
        .filter((line) => line.startsWith('WINDOW_RAW:'))
        .map((line) => JSON.parse(line.slice('WINDOW_RAW:'.length)))
      assert.deepEqual({ cases, rows }, expected)
      for (const file of fs.readdirSync(source))
        if (file.endsWith('.txt'))
          assert.deepEqual(
            fs.readFileSync(path.join(fixture, file.replace(/\.txt$/, ''))),
            fs.readFileSync(path.join(source, file))
          )
      profiles++
    } finally {
      fs.rmSync(fixture, { recursive: true, force: true })
    }
  }
  console.log(
    JSON.stringify({ profiles, cases: profiles * 2, fullRows: profiles * 2 })
  )
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
