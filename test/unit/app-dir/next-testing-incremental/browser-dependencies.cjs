const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const repo =
  process.env.NEXT_TEST_BROWSER_DEPENDENCY_ROOT ||
  path.resolve(__dirname, '../../../..')
const fromNext = (name) =>
  require(path.join(repo, 'packages/next/dist/experimental/testing', name))
const { parseTestConfig } = fromNext('config')
const { discoverTests } = fromNext('discovery')
const { runWatchProcess } = fromNext('watch-process')
const { selectSourceRelatedProjects } = fromNext('incremental/source-selection')
const mode = process.argv[2]
const kind = process.argv[3] || 'static'
assert.ok(['development', 'production'].includes(mode))
assert.ok(['static', 'setup', 'dynamic', 'opaque'].includes(kind))
const source = path.join(__dirname, 'browser-dependencies')
const fixture = fs.mkdtempSync(path.join(repo, '.next-browser-dependencies-'))
const originals = new Map()
for (const name of fs.readdirSync(source)) {
  if (!name.endsWith('.txt')) continue
  const bytes = fs.readFileSync(path.join(source, name))
  const target = name.slice(0, -4)
  originals.set(target, bytes)
  fs.writeFileSync(path.join(fixture, target), bytes)
}
fs.symlinkSync(
  path.join(repo, 'node_modules'),
  path.join(fixture, 'node_modules')
)
fs.writeFileSync(
  path.join(fixture, 'next.config.mjs'),
  'export default ' + JSON.stringify({ turbopack: { root: repo } }) + '\n'
)
const authoredConfig = {
  maxWorkers: 1,
  projects: [
    {
      name: 'browser-dependencies',
      mode,
      include:
        kind === 'dynamic'
          ? ['dynamic.test.mjs']
          : kind === 'opaque'
            ? ['opaque.test.mjs']
            : ['alpha.test.mjs', 'beta.test.mjs'],
      ...(kind === 'setup' ? { setupFiles: ['./setup.mjs'] } : {}),
      browser: { enabled: true, instances: [{ browser: 'chromium' }] },
    },
  ],
}
const configFile = path.join(fixture, 'next.test.config.json')
fs.writeFileSync(configFile, JSON.stringify(authoredConfig, null, 2) + '\n')
originals.set('next.test.config.json', fs.readFileSync(configFile))
const config = parseTestConfig(JSON.parse(fs.readFileSync(configFile, 'utf8')))
const controller = new AbortController()
let timedOut = false
const timer = setTimeout(() => {
  timedOut = true
  controller.abort(new Error('Browser dependency planner deadline'))
}, 120000)
;(async () => {
  try {
    const projects = await discoverTests(fixture, config)
    const response = await runWatchProcess(
      {
        operation: 'plan',
        projectDir: fixture,
        projects,
        certifiedTestConfig: true,
      },
      {
        signal: controller.signal,
        write: (text) => process.stderr.write(text),
      }
    )
    assert.equal(response.operation, 'plan')
    const plan = response.plan
    assert.equal(plan.configuration.complete, true)
    for (const entry of plan.entries) {
      if (kind === 'dynamic') {
        assert.equal(entry.compilationFailed, true)
        assert.equal(entry.dependencies, undefined)
        continue
      }
      assert.equal(entry.compilationFailed, undefined)
      assert.ok(
        entry.dependencies,
        'Actual native dependency metadata is required'
      )
      for (const file of entry.dependencies.files) {
        assert.equal(
          createHash('sha256').update(fs.readFileSync(file.file)).digest('hex'),
          file.sha256
        )
      }
    }
    const selected = async (file) =>
      (
        await selectSourceRelatedProjects(
          projects,
          [path.join(fixture, file)],
          plan
        )
      )
        .flatMap((project) =>
          project.entries.map((entry) => path.basename(entry.file))
        )
        .sort()
    if (kind === 'dynamic') {
      assert.equal(plan.entries.length, 1)
      assert.deepEqual(await selected('unrelated.mjs'), ['dynamic.test.mjs'])
    } else if (kind === 'opaque') {
      assert.equal(plan.entries.length, 1)
      assert.equal(plan.entries[0].dependencies.complete, false)
      assert.deepEqual(await selected('unrelated.mjs'), ['opaque.test.mjs'])
      assert.deepEqual(await selected('opaque-subject.cjs'), [
        'opaque.test.mjs',
      ])
    } else {
      assert.equal(plan.entries.length, 2)
      for (const entry of plan.entries)
        assert.equal(entry.dependencies.complete, true)
      assert.deepEqual(await selected('source-alpha.mjs'), ['alpha.test.mjs'])
      assert.deepEqual(await selected('source-beta.mjs'), ['beta.test.mjs'])
      assert.deepEqual(await selected('shared.mjs'), [
        'alpha.test.mjs',
        'beta.test.mjs',
      ])
      assert.deepEqual(await selected('unrelated.mjs'), [])
      if (kind === 'setup') {
        assert.deepEqual(await selected('setup-subject.mjs'), [
          'alpha.test.mjs',
          'beta.test.mjs',
        ])
        for (const entry of plan.entries)
          assert.ok(
            entry.dependencies.files.some(
              (file) => file.file === path.join(fixture, 'setup-subject.mjs')
            )
          )
      }
    }
    for (const [name, bytes] of originals)
      assert.deepEqual(fs.readFileSync(path.join(fixture, name)), bytes)
    assert.equal(timedOut, false)
    process.stdout.write(
      JSON.stringify({
        mode,
        kind,
        actualNativePlan: plan,
        closedNativePlan: true,
        ...(kind === 'dynamic'
          ? {
              controlOnly:
                'Creator-refused computed request is conservatively selected; dynamic execution remains open',
            }
          : {}),
      }) + '\n'
    )
  } finally {
    clearTimeout(timer)
    controller.abort()
    fs.rmSync(fixture, { recursive: true, force: true })
  }
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
