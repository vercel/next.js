const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

async function main() {
  const [repo, mode] = process.argv.slice(2)
  const { runOwnedNode, assertOwnedNodeCompleted } = await import(
    path.join(
      repo,
      'test/e2e/app-dir/next-testing-package/process-supervisor.mjs'
    )
  )
  const inputs = path.join(__dirname, 'result-cache-fixtures')
  const expected = JSON.parse(
    fs.readFileSync(path.join(inputs, 'expected.json'))
  )
  const fixture = fs.mkdtempSync(
    path.join(repo, '.next-result-cache-concurrency-')
  )
  const reports = fs.mkdtempSync(
    path.join(os.tmpdir(), 'next-result-cache-proof-')
  )
  const cachePath = path.join(fixture, '.next-test-cache/results.json')
  const canonical = (value, key) => {
    if (Array.isArray(value)) return value.map((item) => canonical(item))
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value)
          .filter(
            ([name]) =>
              !['next', 'startTime', 'endTime', 'duration'].includes(name)
          )
          .map(([name, item]) => [name, canonical(item, name)])
      )
    return key === 'name' && typeof value === 'string'
      ? path.basename(value)
      : value
  }
  let readersClosed = true
  let verified = false
  try {
    fs.mkdirSync(path.join(fixture, 'app'))
    fs.writeFileSync(
      path.join(fixture, 'package.json'),
      '{"private":true,"type":"module"}\n'
    )
    fs.symlinkSync(
      path.join(repo, 'node_modules'),
      path.join(fixture, 'node_modules')
    )
    for (const name of fs.readdirSync(inputs)) {
      if (!name.endsWith('.txt')) continue
      const target =
        name === 'layout.jsx.txt' || name === 'page.jsx.txt'
          ? path.join(fixture, 'app', name.slice(0, -4))
          : path.join(fixture, name.slice(0, -4))
      fs.copyFileSync(path.join(inputs, name), target)
    }
    fs.writeFileSync(
      path.join(fixture, 'next.config.mjs'),
      'export default ' + JSON.stringify({ turbopack: { root: repo } }) + '\n'
    )
    // The public caller uses the actual selected worker count.
    fs.writeFileSync(
      path.join(fixture, 'next.test.config.json'),
      JSON.stringify({
        projects: [{ name: 'cache-project', mode, include: ['*.case.mjs'] }],
      }) + '\n'
    )
    const env = {
      ...process.env,
      NODE_ENV: mode,
      NEXT_TELEMETRY_DISABLED: '1',
      FORCE_COLOR: '0',
    }
    delete env.CI
    delete env.NODE_OPTIONS
    delete env.NODE_PATH
    for (const [phase, maxWorkers] of [
      ['fresh', 2],
      ['failed-history', 3],
    ]) {
      fs.writeFileSync(
        path.join(fixture, 'next.test.config.json'),
        JSON.stringify({
          maxWorkers,
          projects: [{ name: 'cache-project', mode, include: ['*.case.mjs'] }],
        })
      )
      if (phase === 'failed-history')
        fs.writeFileSync(
          cachePath,
          JSON.stringify({
            version: 1,
            projects: {
              'cache-project': {
                files: {
                  'a-small.case.mjs': { failed: true, duration: 2, lastRun: 1 },
                  'b-medium.case.mjs': {
                    failed: true,
                    duration: 10,
                    lastRun: 1,
                  },
                  'z-large.case.mjs': {
                    failed: false,
                    duration: 999,
                    lastRun: 1,
                  },
                },
              },
            },
          })
        )
      const report = path.join(reports, phase + '.json')
      readersClosed = false
      const owner = await runOwnedNode(
        [
          path.join(repo, 'packages/next/dist/bin/next'),
          'test',
          fixture,
          '--run',
          '--reporter=json',
          '--outputFile=' + report,
        ],
        {
          cwd: fixture,
          env,
          timeoutMs: 120000,
          auditDir: path.join(reports, phase + '-owners'),
        }
      )
      fs.writeFileSync(
        path.join(reports, phase + '-owner.json'),
        JSON.stringify(owner, null, 2) + '\n'
      )
      assertOwnedNodeCompleted(owner, 'persistent cache ' + mode + ' ' + phase)
      readersClosed = true
      assert.equal(owner.status, 0, owner.stdout + owner.stderr)
      const result = JSON.parse(fs.readFileSync(report))
      const rows = result.next.events
        .filter((event) => event.type === 'output')
        .map(({ stream, text }) => ({ stream, text }))
      assert.equal(rows.length, expected.rows[phase].length)
      for (const file of expected.report.testResults.map(
        (result) => result.name
      )) {
        const belongs = (row) =>
          row.text.startsWith('CACHE:' + path.basename(file) + ':')
        assert.deepEqual(
          rows.filter(belongs),
          expected.rows[phase].filter(belongs)
        )
      }
      assert.deepEqual(canonical(result), expected.report)
      assert(!JSON.stringify(result).includes('moduleExecution'))
      const cache = JSON.parse(fs.readFileSync(cachePath))
      const files = cache.projects['cache-project'].files
      assert.deepEqual(Object.keys(files).sort(), [
        'a-small.case.mjs',
        'b-medium.case.mjs',
        'z-large.case.mjs',
      ])
      for (const record of Object.values(files)) {
        assert.equal(record.failed, false)
        assert(Number.isFinite(record.duration) && record.duration >= 0)
        assert(Number.isFinite(record.lastRun) && record.lastRun > 1)
      }
    }
    verified = true
    console.log(
      JSON.stringify({
        mode,
        profiles: 2,
        cases: 12,
        rows: 12,
        wholeReports: true,
        actualCache: true,
        perFileOrder: true,
        workers: [2, 3],
        ownersClosed: true,
      })
    )
  } catch (error) {
    console.error('Persistent cache evidence: ' + reports)
    throw error
  } finally {
    if (readersClosed) {
      fs.rmSync(fixture, { recursive: true, force: true })
      if (verified) fs.rmSync(reports, { recursive: true, force: true })
    }
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
