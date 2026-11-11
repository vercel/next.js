const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')

const [mode, playwrightDirectory, installedDirectory] = process.argv.slice(2)
assert.ok(['development', 'production'].includes(mode))
const sourceRepo = path.resolve(__dirname, '../../..')
const repo = installedDirectory ? path.resolve(installedDirectory) : sourceRepo
const nextBinary = installedDirectory
  ? path.join(repo, 'node_modules/next/dist/bin/next')
  : path.join(repo, 'packages/next/dist/bin/next')
const fixture = fs.mkdtempSync(
  path.join(repo, '.next-test-browser-snapshot-map-')
)
const original = path.join(
  sourceRepo,
  'test/unit/app-dir/next-testing-stable-release-gaps/fixtures/snapshot-browser-profile'
)

async function run(update) {
  const output = update ? 'update.json' : 'match.json'
  const env = {
    ...process.env,
    NODE_ENV: mode,
    NEXT_TELEMETRY_DISABLED: '1',
    FORCE_COLOR: '0',
  }
  delete env.CI
  const child = spawn(
    process.execPath,
    [
      nextBinary,
      'test',
      fixture,
      '--run',
      '--reporter=json',
      '--outputFile=' + output,
      ...(update ? ['--update'] : []),
    ],
    { cwd: fixture, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] }
  )
  const stdout = [],
    stderr = []
  child.stdout.on('data', (value) => stdout.push(value))
  child.stderr.on('data', (value) => stderr.push(value))
  let forced = false,
    killTimer
  const timer = setTimeout(() => {
    forced = true
    process.kill(-child.pid, 'SIGTERM')
    killTimer = setTimeout(() => process.kill(-child.pid, 'SIGKILL'), 5000)
  }, 120000)
  try {
    const close = await new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('close', (code, signal) => resolve({ code, signal }))
    })
    const report = JSON.parse(
      fs.readFileSync(path.join(fixture, output), 'utf8')
    )
    if (close.code !== 0 || close.signal || forced)
      process.stderr.write(JSON.stringify(report) + '\n')
    assert.deepEqual(close, { code: 0, signal: null })
    assert.equal(forced, false)
    const observations = Object.fromEntries(
      [
        'success',
        'numTotalTests',
        'numPassedTests',
        'numFailedTests',
        'numPendingTests',
        'numTodoTests',
        'numTotalTestSuites',
        'numPassedTestSuites',
        'numFailedTestSuites',
        'numPendingTestSuites',
        'snapshot',
      ].map((name) => [name, report[name]])
    )
    observations.cases = report.testResults.flatMap((file) =>
      file.assertionResults.map((test) =>
        Object.fromEntries(
          [
            'ancestorTitles',
            'fullName',
            'status',
            'title',
            'failureMessages',
          ].map((name) => [name, test[name]])
        )
      )
    )
    assert.equal(report.success, true)
    assert.equal(report.numPassedTests, 1)
    assert.equal(report.numFailedTests, 0)
    assert.equal(report.numPendingTests, 0)
    assert.deepEqual(observations.cases, [
      {
        ancestorTitles: [],
        fullName: 'profile snapshot round trip',
        status: 'passed',
        title: 'profile snapshot round trip',
        failureMessages: [],
      },
    ])
    return { close, forced, observations }
  } catch (error) {
    process.stderr.write(Buffer.concat(stdout))
    process.stderr.write(Buffer.concat(stderr))
    throw error
  } finally {
    clearTimeout(timer)
    clearTimeout(killTimer)
  }
}

async function main() {
  try {
    fs.copyFileSync(
      path.join(original, 'contract.case.mjs'),
      path.join(fixture, 'contract.case.mjs')
    )
    fs.writeFileSync(
      path.join(fixture, 'package.json'),
      '{"private":true,"type":"module"}\n'
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
            name: 'snapshot-map',
            mode,
            include: ['*.case.mjs'],
            browser: { enabled: true },
          },
        ],
      })
    )
    fs.mkdirSync(path.join(fixture, 'app'))
    fs.writeFileSync(
      path.join(fixture, 'app/layout.jsx'),
      'export default function Layout({children}){return <html><body>{children}</body></html>}\n'
    )
    fs.writeFileSync(
      path.join(fixture, 'app/page.jsx'),
      'export default function Page(){return null}\n'
    )
    const modules = path.join(fixture, 'node_modules')
    fs.mkdirSync(modules)
    for (const name of fs.readdirSync(path.join(repo, 'node_modules'))) {
      if (['.vite', '.vite-temp', '.cache', '.vitest-cache'].includes(name))
        fs.mkdirSync(path.join(modules, name))
      else if (name === 'playwright' && playwrightDirectory) continue
      else
        fs.symlinkSync(
          path.join(repo, 'node_modules', name),
          path.join(modules, name)
        )
    }
    if (playwrightDirectory)
      fs.symlinkSync(
        path.resolve(playwrightDirectory),
        path.join(modules, 'playwright')
      )
    const authored = fs.readFileSync(
      path.join(fixture, 'contract.case.mjs'),
      'utf8'
    )
    assert.equal(
      authored,
      fs.readFileSync(path.join(original, 'contract.case.mjs'), 'utf8')
    )
    const update = await run(true)
    const source = fs.readFileSync(
      path.join(fixture, 'contract.case.mjs'),
      'utf8'
    )
    const external = fs.readFileSync(
      path.join(fixture, '__snapshots__/contract.case.mjs.snap'),
      'utf8'
    )
    const match = await run(false)
    assert.equal(
      fs.readFileSync(path.join(fixture, 'contract.case.mjs'), 'utf8'),
      source
    )
    assert.equal(
      fs.readFileSync(
        path.join(fixture, '__snapshots__/contract.case.mjs.snap'),
        'utf8'
      ),
      external
    )
    return { mode, authored, source, external, update, match }
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true })
  }
}

main().then(
  (result) =>
    process.stdout.write(
      JSON.stringify({ ...result, fixtureRemoved: !fs.existsSync(fixture) }) +
        '\n'
    ),
  (error) => {
    console.error(error)
    process.exitCode = 1
  }
)
