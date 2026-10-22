const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { EventEmitter } = require('node:events')
const { createHash } = require('node:crypto')
const repo =
  process.env.NEXT_TEST_COVERAGE_CONSUMER_ROOT ||
  path.resolve(__dirname, '../../..')
const source = path.join(
  __dirname,
  '../app-dir/next-testing-stable-release-gaps/fixtures/standard-coverage'
)
const expected = require('./configured-watch.expected.json')
const scenario = process.argv
  .find((value) => value.startsWith('--scenario='))
  ?.split('=')[1]
let profiles = 0
let generations = 0
let completeReports = 0
function read(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}
function maps(file) {
  return Object.fromEntries(
    Object.entries(read(file)).map(([name, value]) => [
      path.basename(name),
      { ...value, path: path.basename(value.path) },
    ])
  )
}
async function launch(
  mode,
  coverage,
  flags = [],
  settings = {},
  beforeStart = () => {},
  human = true
) {
  const fixture = fs.mkdtempSync(
    path.join(repo, '.next-test-configured-watch-')
  )
  for (const file of fs.readdirSync(source))
    fs.copyFileSync(path.join(source, file), path.join(fixture, file))
  fs.writeFileSync(path.join(fixture, 'next.config.mjs'), 'export default {}\n')
  const setConfig = (value) =>
    fs.writeFileSync(
      path.join(fixture, 'next.test.config.json'),
      JSON.stringify({
        test: {
          include: ['contract.case.mjs'],
          mode,
          coverage: value,
          ...settings,
        },
      })
    )
  setConfig(coverage)
  beforeStart(fixture)
  const events = new EventEmitter()
  let stdout = '',
    stderr = '',
    closed = false
  const child = spawn(
    process.execPath,
    [
      path.join(repo, 'packages/next/dist/bin/next'),
      'test',
      fixture,
      '--watch',
      '--max-workers=1',
      ...(human ? ['--reporter=default'] : []),
      '--reporter=json',
      '--outputFile=result.json',
      ...flags,
    ],
    {
      cwd: repo,
      env: {
        ...process.env,
        CI: '1',
        NEXT_TELEMETRY_DISABLED: '1',
        NO_COLOR: '1',
        NODE_ENV: mode,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    }
  )
  child.stdout.on('data', (chunk) => {
    stdout += chunk
    events.emit('change')
  })
  child.stderr.on('data', (chunk) => {
    stderr += chunk
    events.emit('change')
  })
  child.once('exit', () => {
    closed = true
    events.emit('change')
  })
  const watcher = fs.watch(fixture, { recursive: true }, () =>
    events.emit('change')
  )
  const ready = () =>
    human
      ? (
          stdout.match(
            /(?:Waiting for file changes|Tests failed\. Watching for file changes)\.\.\./g
          ) || []
        ).length
      : Number(fs.existsSync(path.join(fixture, 'result.json')))
  let current = 0
  async function settle() {
    const target = ++current
    await new Promise((resolve, reject) => {
      const deadline = setTimeout(
        () =>
          finish(
            new Error(
              `Watch generation ${target} timed out.\n${stdout}\n${stderr}`
            )
          ),
        45000
      )
      function finish(error) {
        clearTimeout(deadline)
        events.removeListener('change', check)
        error ? reject(error) : resolve()
      }
      function check() {
        if (closed)
          return finish(
            new Error(
              `Watch exited before generation ${target}.\n${stdout}\n${stderr}`
            )
          )
        if (ready() >= target) finish()
      }
      events.on('change', check)
      check()
    })
    const result = read(path.join(fixture, 'result.json'))
    generations++
    return {
      cases: result.testResults.flatMap((file) =>
        file.assertionResults.map(({ fullName, status, failureMessages }) => ({
          fullName,
          status,
          failureMessages,
        }))
      ),
      success: result.success,
    }
  }
  async function close() {
    watcher.close()
    if (!closed) {
      const exit = new Promise((resolve) => child.once('exit', resolve))
      child.kill('SIGINT')
      const deadline = setTimeout(() => child.kill('SIGKILL'), 15000)
      await exit
      clearTimeout(deadline)
    }
    child.stdin.destroy()
    if (process.env.NEXT_TEST_COVERAGE_KEEP_RESULTS) {
      fs.writeFileSync(path.join(fixture, 'watch.stdout'), stdout)
      fs.writeFileSync(path.join(fixture, 'watch.stderr'), stderr)
    } else fs.rmSync(fixture, { recursive: true, force: true })
  }
  profiles++
  return {
    fixture,
    setConfig,
    settle,
    close,
    get stdout() {
      return stdout
    },
    get stderr() {
      return stderr
    },
  }
}
function report(fixture, directory, name) {
  assert.deepEqual(
    maps(path.join(fixture, directory, 'coverage-final.json')),
    expected.reports[name]
  )
  completeReports++
}
const base = {
  provider: 'v8',
  enabled: true,
  include: ['subject.mjs', 'unimported.mjs'],
  exclude: ['contract.case.mjs', 'excluded.mjs'],
  reporter: ['json'],
  reportsDirectory: 'watch-a',
  clean: true,
  cleanOnRerun: true,
}
async function matrix(mode) {
  for (const row of expected.cleanMatrix) {
    const config = { ...base, clean: row.clean, cleanOnRerun: row.cleanOnRerun }
    const run = await launch(mode, config, [], {}, (fixture) => {
      const directory = path.join(fixture, 'watch-a')
      fs.mkdirSync(directory)
      fs.writeFileSync(path.join(directory, 'initial.txt'), 'initial')
    })
    try {
      const directory = path.join(run.fixture, 'watch-a')
      assert.deepEqual(await run.settle(), {
        cases: expected.cases,
        success: true,
      })
      report(run.fixture, 'watch-a', 'all')
      assert.equal(
        fs.existsSync(path.join(directory, 'initial.txt')),
        row.initialRetained
      )
      fs.writeFileSync(path.join(directory, 'rerun.txt'), 'rerun')
      fs.appendFileSync(
        path.join(run.fixture, 'contract.case.mjs'),
        '\n// measured configured watch rerun\n'
      )
      assert.deepEqual(await run.settle(), {
        cases: expected.cases,
        success: true,
      })
      report(run.fixture, 'watch-a', row.rerunReport)
      assert.equal(
        fs.existsSync(path.join(directory, 'initial.txt')),
        row.initialRetainedAfterRerun
      )
      assert.equal(
        fs.existsSync(path.join(directory, 'rerun.txt')),
        row.rerunRetained
      )
    } finally {
      await run.close()
    }
  }
}
async function refresh(mode) {
  const run = await launch(mode, base)
  try {
    assert.deepEqual(await run.settle(), {
      cases: expected.cases,
      success: true,
    })
    report(run.fixture, 'watch-a', 'all')
    fs.writeFileSync(path.join(run.fixture, 'watch-a', 'rerun.txt'), 'rerun')
    fs.appendFileSync(
      path.join(run.fixture, 'contract.case.mjs'),
      '\n// measured watch rerun one\n'
    )
    assert.deepEqual(await run.settle(), {
      cases: expected.cases,
      success: true,
    })
    report(run.fixture, 'watch-a', 'partial')
    assert.equal(
      fs.existsSync(path.join(run.fixture, 'watch-a', 'rerun.txt')),
      false
    )
    fs.writeFileSync(
      path.join(run.fixture, 'watch-a', 'config-keep.txt'),
      'config-keep'
    )
    run.setConfig({ ...base, clean: false, cleanOnRerun: false })
    assert.deepEqual(await run.settle(), {
      cases: expected.cases,
      success: true,
    })
    report(run.fixture, 'watch-a', 'all')
    assert.equal(
      fs.existsSync(path.join(run.fixture, 'watch-a', 'config-keep.txt')),
      true
    )
    fs.mkdirSync(path.join(run.fixture, 'watch-b'))
    fs.writeFileSync(
      path.join(run.fixture, 'watch-b', 'disabled-keep.txt'),
      'disabled-keep'
    )
    const previous = fs.readFileSync(
      path.join(run.fixture, 'watch-a', 'coverage-final.json')
    )
    run.setConfig({ ...base, enabled: false, reportsDirectory: 'watch-b' })
    assert.deepEqual(await run.settle(), {
      cases: expected.cases,
      success: true,
    })
    assert.deepEqual(
      fs.readFileSync(path.join(run.fixture, 'watch-a', 'coverage-final.json')),
      previous
    )
    assert.equal(
      fs.existsSync(path.join(run.fixture, 'watch-b', 'coverage-final.json')),
      false
    )
    assert.equal(
      fs.existsSync(path.join(run.fixture, 'watch-b', 'disabled-keep.txt')),
      true
    )
    run.setConfig({
      ...base,
      reportsDirectory: 'watch-b',
      reporter: ['json', 'json-summary'],
    })
    assert.deepEqual(await run.settle(), {
      cases: expected.cases,
      success: true,
    })
    report(run.fixture, 'watch-b', 'all')
    assert.equal(
      fs.existsSync(path.join(run.fixture, 'watch-b', 'disabled-keep.txt')),
      false
    )
    assert.ok(
      read(path.join(run.fixture, 'watch-b', 'coverage-summary.json')).total
        .lines.covered > 0
    )
  } finally {
    await run.close()
  }
}
async function empty(mode) {
  for (const allow of [undefined, false, true]) {
    const run = await launch(
      mode,
      base,
      ['--related=unimported.mjs'],
      allow === undefined ? {} : { passWithNoTests: allow }
    )
    try {
      assert.deepEqual(await run.settle(), { cases: [], success: true })
      report(run.fixture, 'watch-a', 'empty')
      fs.appendFileSync(
        path.join(run.fixture, 'contract.case.mjs'),
        "\nimport './unimported.mjs'\n"
      )
      assert.deepEqual(await run.settle(), {
        cases: expected.cases,
        success: true,
      })
      report(run.fixture, 'watch-a', 'all')
    } finally {
      await run.close()
    }
  }
}
async function overrides(mode) {
  const run = await launch(
    mode,
    {
      ...base,
      enabled: false,
      include: ['excluded.mjs'],
      reporter: ['lcovonly'],
      reportsDirectory: 'wrong',
    },
    [
      '--coverage',
      '--coverage.include=subject.mjs',
      '--coverage.reporter=json',
      '--coverage.reportsDirectory=cli-coverage',
    ]
  )
  try {
    assert.deepEqual(await run.settle(), {
      cases: expected.cases,
      success: true,
    })
    report(run.fixture, 'cli-coverage', 'partial')
    assert.equal(fs.existsSync(path.join(run.fixture, 'wrong')), false)
    run.setConfig({
      ...base,
      enabled: false,
      include: ['unimported.mjs'],
      reporter: ['text'],
      reportsDirectory: 'changed-wrong',
    })
    assert.deepEqual(await run.settle(), {
      cases: expected.cases,
      success: true,
    })
    report(run.fixture, 'cli-coverage', 'partial')
    assert.equal(fs.existsSync(path.join(run.fixture, 'changed-wrong')), false)
  } finally {
    await run.close()
  }
}

async function defaults(mode) {
  const run = await launch(
    mode,
    { ...base, reporter: undefined },
    [],
    {},
    undefined,
    false
  )
  try {
    assert.deepEqual(await run.settle(), {
      cases: expected.cases,
      success: true,
    })
    report(run.fixture, 'watch-a', 'all')
    const directory = path.join(run.fixture, 'watch-a')
    const pristine =
      require('./project-configured-coverage.expected.json').profiles.find(
        (row) => row.mode === mode && row.name === 'defaults'
      )
    for (const file of [
      'index.html',
      'subject.mjs.html',
      'unimported.mjs.html',
      'clover.xml',
    ])
      assert.equal(fs.existsSync(path.join(directory, file)), true, file)
    for (const [file, hash] of Object.entries(pristine.assetHashes))
      assert.equal(
        createHash('sha256')
          .update(fs.readFileSync(path.join(directory, file)))
          .digest('hex'),
        hash,
        file
      )
    const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8')
    for (const [, link] of html.matchAll(/(?:href|src)="([^"#:]+)"/g))
      assert.equal(
        fs.existsSync(path.join(directory, link.split('?')[0])),
        true,
        link
      )
    assert.match(
      fs.readFileSync(path.join(directory, 'clover.xml'), 'utf8'),
      /subject\.mjs/
    )
    assert.match(run.stdout, /All files/)
  } finally {
    await run.close()
  }
}
async function disabled(mode) {
  for (const provider of ['v8', 'custom']) {
    const customSource = path.join(
      __dirname,
      '../app-dir/next-testing-stable-release-gaps/fixtures/custom-coverage-provider'
    )
    const config =
      provider === 'v8'
        ? base
        : {
            provider: 'custom',
            enabled: true,
            customProviderModule: './coverage-provider.mjs',
          }
    const cases =
      provider === 'v8'
        ? expected.cases
        : require('./custom-disable.expected.json').rows.find(
            (row) => row.mode === mode && row.disabled
          ).cases
    const run = await launch(mode, config, ['--no-coverage'], {}, (fixture) => {
      if (provider === 'custom')
        for (const file of ['contract.case.mjs', 'coverage-provider.mjs'])
          fs.copyFileSync(
            path.join(customSource, file),
            path.join(fixture, file)
          )
    })
    try {
      for (const generation of [1, 2]) {
        if (generation === 2)
          run.setConfig({
            ...config,
            reportsDirectory: 'disabled-new-directory',
          })
        assert.deepEqual(await run.settle(), { cases, success: true })
        for (const file of [
          'watch-a',
          'disabled-new-directory',
          'provider-trace.jsonl',
          'custom-coverage.json',
        ])
          assert.equal(fs.existsSync(path.join(run.fixture, file)), false, file)
      }
    } finally {
      await run.close()
    }
  }
}

async function enable(mode) {
  const run = await launch(mode, { ...base, enabled: false }, ['--coverage'])
  try {
    assert.deepEqual(await run.settle(), {
      cases: expected.cases,
      success: true,
    })
    report(run.fixture, 'watch-a', 'all')
    run.setConfig({
      ...base,
      enabled: false,
      include: ['subject.mjs'],
      reportsDirectory: 'watch-b',
    })
    assert.deepEqual(await run.settle(), {
      cases: expected.cases,
      success: true,
    })
    report(run.fixture, 'watch-b', 'partial')
  } finally {
    await run.close()
  }
}

;(async () => {
  for (const mode of ['development', 'production'])
    for (const [name, run] of Object.entries({
      matrix,
      refresh,
      empty,
      overrides,
      defaults,
      disabled,
      enable,
    }))
      if (!scenario || scenario === name) await run(mode)
  process.stdout.write(
    JSON.stringify({ profiles, generations, completeReports }) + '\n'
  )
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
