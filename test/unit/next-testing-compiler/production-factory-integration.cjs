const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')

const [environment, mode, playwrightDirectory] = process.argv.slice(2)
assert.ok(['node', 'browser'].includes(environment))
assert.ok(['development', 'production'].includes(mode))
const repo = path.resolve(__dirname, '../../..')
const original = path.join(
  repo,
  'test/unit/app-dir/next-testing-stable-release-gaps/fixtures/production-module-mock'
)
const fixture = fs.mkdtempSync(
  path.join(repo, '.next-test-production-factory-')
)
let child
let timer
let killTimer
let forced = false
const stdout = []
const stderr = []

async function main() {
  try {
    for (const name of fs.readdirSync(original))
      fs.copyFileSync(path.join(original, name), path.join(fixture, name))
    fs.writeFileSync(
      path.join(fixture, 'package.json'),
      '{"private":true,"type":"module"}\n'
    )
    fs.writeFileSync(
      path.join(fixture, 'next.config.mjs'),
      'export default {}\n'
    )
    fs.mkdirSync(path.join(fixture, 'app'))
    fs.writeFileSync(
      path.join(fixture, 'app/layout.jsx'),
      'export default function Layout({children}) { return <html><body>{children}</body></html> }\n'
    )
    fs.writeFileSync(
      path.join(fixture, 'app/page.jsx'),
      'export default function Page() { return null }\n'
    )
    fs.writeFileSync(
      path.join(fixture, 'next.test.config.json'),
      JSON.stringify({
        maxWorkers: 1,
        projects: [
          {
            name: 'production-factory',
            mode,
            include: ['*.case.mjs'],
            ...(environment === 'browser'
              ? { browser: { enabled: true } }
              : { environment: 'node' }),
          },
        ],
      })
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
    const env = {
      ...process.env,
      NODE_ENV: mode,
      NEXT_TELEMETRY_DISABLED: '1',
      FORCE_COLOR: '0',
    }
    delete env.CI
    child = spawn(
      process.execPath,
      [
        path.join(repo, 'packages/next/dist/bin/next'),
        'test',
        fixture,
        '--run',
        '--reporter',
        'json',
        '--outputFile',
        'result.json',
      ],
      { cwd: fixture, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] }
    )
    child.stdout.on('data', (value) => stdout.push(value))
    child.stderr.on('data', (value) => stderr.push(value))
    timer = setTimeout(() => {
      forced = true
      process.kill(-child.pid, 'SIGTERM')
      killTimer = setTimeout(() => process.kill(-child.pid, 'SIGKILL'), 5000)
    }, 120000)
    const close = await new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('close', (code, signal) => resolve({ code, signal }))
    })
    clearTimeout(timer)
    clearTimeout(killTimer)
    const report = JSON.parse(
      fs.readFileSync(path.join(fixture, 'result.json'), 'utf8')
    )
    const cases = report.testResults.flatMap((file) =>
      file.assertionResults.map(({ fullName, status, failureMessages }) => ({
        name: fullName,
        status,
        failureMessages,
      }))
    )
    assert.deepEqual(close, { code: 0, signal: null })
    assert.equal(forced, false)
    assert.equal(report.success, true)
    assert.equal(report.numTotalTests, 1)
    assert.equal(report.numPassedTests, 1)
    assert.equal(report.numFailedTests, 0)
    assert.equal(report.numPendingTests, 0)
    assert.equal(report.numTodoTests, 0)
    assert.deepEqual(cases, [
      {
        name: 'factory mocks production compiled entry',
        status: 'passed',
        failureMessages: [],
      },
    ])
    for (const name of fs.readdirSync(original))
      assert.deepEqual(
        fs.readFileSync(path.join(fixture, name)),
        fs.readFileSync(path.join(original, name))
      )
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
    return {
      environment,
      mode,
      close,
      forced,
      cases,
      observations,
      authoredSourcesUnchanged: true,
    }
  } finally {
    clearTimeout(timer)
    clearTimeout(killTimer)
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
    process.stderr.write(Buffer.concat(stdout))
    process.stderr.write(Buffer.concat(stderr))
    console.error(error)
    process.exitCode = 1
  }
)
