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
  const evidence = fs.mkdtempSync(
    path.join(os.tmpdir(), 'next-authored-cache-proof-')
  )
  const specs = [
    { label: 'json-false', format: 'json', cache: false, enabled: false },
    { label: 'module-true', format: 'module', cache: true, enabled: true },
    {
      label: 'leading-true',
      format: 'module',
      cache: false,
      flags: ['--cache'],
      enabled: true,
    },
    {
      label: 'leading-false',
      format: 'json',
      cache: { dir: 'ignored-cache-dir' },
      flags: ['--cache=false'],
      enabled: false,
    },
    {
      label: 'legacy-dir',
      format: 'module',
      cache: { dir: 'ignored-cache-dir' },
      enabled: true,
      warning: true,
    },
    {
      label: 'last-true',
      format: 'json',
      cache: true,
      flags: ['--cache=false', '--cache'],
      enabled: true,
    },
    {
      label: 'last-false',
      format: 'json',
      cache: true,
      flags: ['--cache', '--cache=false'],
      enabled: false,
    },
    {
      label: 'literal-true',
      format: 'json',
      cache: false,
      flags: ['--cache=true'],
      enabled: true,
    },
  ]
  const seed = JSON.stringify({
    version: 1,
    projects: {
      'cache-project': {
        files: {
          'a-small.case.mjs': { failed: true, duration: 2, lastRun: 1 },
          'b-medium.case.mjs': { failed: true, duration: 10, lastRun: 1 },
          'z-large.case.mjs': { failed: false, duration: 999, lastRun: 1 },
        },
      },
    },
  })
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
  let success = false
  const records = []
  try {
    // All source/config/seed inputs precede the first actual compiler reader.
    for (const spec of specs) {
      const fixture = fs.mkdtempSync(path.join(repo, '.next-authored-cache-'))
      const dest = path.join(evidence, spec.label)
      fs.mkdirSync(dest)
      fs.mkdirSync(path.join(fixture, 'app'))
      fs.writeFileSync(
        path.join(fixture, 'package.json'),
        '{"private":true,"type":"module"}\n'
      )
      for (const file of fs.readdirSync(inputs))
        if (file.endsWith('.txt')) {
          const target = ['layout.jsx.txt', 'page.jsx.txt'].includes(file)
            ? path.join(fixture, 'app', file.slice(0, -4))
            : path.join(fixture, file.slice(0, -4))
          fs.copyFileSync(path.join(inputs, file), target)
        }
      fs.writeFileSync(
        path.join(fixture, 'next.config.mjs'),
        'export default ' + JSON.stringify({ turbopack: { root: repo } }) + '\n'
      )
      const project = { name: 'cache-project', mode, include: ['*.case.mjs'] }
      if (spec.format === 'json')
        fs.writeFileSync(
          path.join(fixture, 'next.test.config.json'),
          JSON.stringify({ cache: spec.cache, projects: [project] }) + '\n'
        )
      else
        fs.writeFileSync(
          path.join(fixture, 'next.test.config.mjs'),
          "import{defineConfig}from'vitest/config';export default defineConfig(" +
            JSON.stringify({ test: { ...project, cache: spec.cache } }) +
            ')\n'
        )
      const cache = path.join(fixture, '.next-test-cache/results.json')
      fs.mkdirSync(path.dirname(cache))
      fs.writeFileSync(cache, seed)
      records.push({ ...spec, fixture, dest, cache, joined: false })
    }
    for (const record of records) {
      const { fixture, dest, cache } = record
      const report = path.join(dest, 'report.json')
      const audit = path.join(dest, 'result-io.jsonl')
      const env = {
        ...process.env,
        NODE_ENV: mode,
        NEXT_TELEMETRY_DISABLED: '1',
        FORCE_COLOR: '0',
        NODE_OPTIONS:
          '--require=' + path.join(__dirname, 'result-cache-io.cjs'),
        NEXT_TEST_CACHE_AUDIT: audit,
        NEXT_TEST_CACHE_PATH: cache,
      }
      delete env.CI
      delete env.NODE_PATH
      const owner = await runOwnedNode(
        [
          path.join(repo, 'packages/next/dist/bin/next'),
          'test',
          ...(record.flags ?? []),
          fixture,
          '--run',
          '--reporter=json',
          '--outputFile=' + report,
        ],
        {
          cwd: fixture,
          env,
          timeoutMs: 120000,
          auditDir: path.join(dest, 'owners'),
        }
      )
      fs.writeFileSync(
        path.join(dest, 'OWNER.json'),
        JSON.stringify(owner, null, 2) + '\n'
      )
      assertOwnedNodeCompleted(
        owner,
        'authored cache ' + mode + ' ' + record.label
      )
      record.joined = true
      assert.equal(owner.status, 0, owner.stdout + owner.stderr)
      const actual = JSON.parse(fs.readFileSync(report))
      const rows = actual.next.events
        .filter((event) => event.type === 'output')
        .map(({ stream, text }) => ({ stream, text }))
      assert.deepEqual(
        rows,
        expected.rows[record.enabled ? 'failed-history' : 'fresh']
      )
      assert.deepEqual(canonical(actual), expected.report)
      const warnings =
        owner.stderr.match(/ DEPRECATED  "cache.dir" is deprecated/g) ?? []
      assert.equal(warnings.length, record.warning ? 1 : 0)
      assert(!fs.existsSync(path.join(fixture, 'ignored-cache-dir')))
      if (record.enabled) {
        const value = JSON.parse(fs.readFileSync(cache))
        const files = value.projects['cache-project'].files
        assert.deepEqual(Object.keys(files).sort(), [
          'a-small.case.mjs',
          'b-medium.case.mjs',
          'z-large.case.mjs',
        ])
        for (const result of Object.values(files)) {
          assert.equal(result.failed, false)
          assert(Number.isFinite(result.duration) && result.duration >= 0)
          assert(Number.isFinite(result.lastRun) && result.lastRun > 1)
        }
        assert(fs.readFileSync(audit, 'utf8').length > 0)
      } else {
        assert.equal(fs.readFileSync(cache, 'utf8'), seed)
        assert.equal(fs.readFileSync(audit, 'utf8'), '')
      }
      assert(!JSON.stringify(actual).includes('moduleCompletion'))
      assert(!JSON.stringify(actual).includes('moduleExecution'))
    }
    success = true
    console.log(
      JSON.stringify({
        mode,
        profiles: records.length,
        cases: records.length * 6,
        rows: records.length * 6,
        wholeReports: true,
        cacheRules: true,
        realResultIO: true,
        ownersClosed: true,
      })
    )
  } catch (error) {
    console.error('Authored cache evidence: ' + evidence)
    throw error
  } finally {
    if (records.every((record) => record.joined)) {
      for (const record of records)
        fs.rmSync(record.fixture, { recursive: true, force: true })
      if (success) fs.rmSync(evidence, { recursive: true, force: true })
    }
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
