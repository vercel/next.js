const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')

const [mode, playwrightDirectory, installedDirectory, corpus = 'original'] =
  process.argv.slice(2)
assert.ok(['development', 'production'].includes(mode))
assert.ok(['original', 'composition'].includes(corpus))
const sourceRepo = path.resolve(__dirname, '../../..')
const repo = installedDirectory ? path.resolve(installedDirectory) : sourceRepo
const original = path.join(
  sourceRepo,
  corpus === 'composition'
    ? 'test/unit/next-testing-compiler/fixtures/production-browser-spies'
    : 'test/unit/app-dir/next-testing-stable-release-gaps/fixtures/browser-module-mocks'
)
const fixture = fs.mkdtempSync(
  path.join(repo, '.next-test-production-browser-spy-')
)

async function main() {
  let timer, killTimer
  const stdout = [],
    stderr = []
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
    fs.writeFileSync(
      path.join(fixture, 'next.test.config.json'),
      JSON.stringify({
        maxWorkers: 1,
        projects: [
          {
            name: 'production-spy',
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
      'export default function Layout({children}) { return <html><body>{children}</body></html> }\n'
    )
    fs.writeFileSync(
      path.join(fixture, 'app/page.jsx'),
      'export default function Page() { return null }\n'
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
    const child = spawn(
      process.execPath,
      [
        installedDirectory
          ? path.join(repo, 'node_modules/next/dist/bin/next')
          : path.join(repo, 'packages/next/dist/bin/next'),
        'test',
        fixture,
        '--run',
        '--reporter=json',
        '--outputFile=report.json',
      ],
      { cwd: fixture, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] }
    )
    child.stdout.on('data', (value) => stdout.push(value))
    child.stderr.on('data', (value) => stderr.push(value))
    let forced = false
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
      fs.readFileSync(path.join(fixture, 'report.json'), 'utf8')
    )
    if (close.code !== 0 || close.signal || forced)
      process.stderr.write(JSON.stringify(report) + '\n')
    assert.deepEqual(close, { code: 0, signal: null })
    assert.equal(forced, false)
    assert.equal(report.success, true)
    const names =
      corpus === 'composition'
        ? [
            'keeps named and namespace spies on the same function',
            'spies on class instances and nested object methods',
            'composes explicit factory and original spies',
          ]
        : ['client graph honors module mocks']
    assert.equal(report.numTotalTests, names.length)
    assert.equal(report.numPassedTests, names.length)
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
    assert.deepEqual(
      observations.cases,
      names.map((name) => ({
        ancestorTitles: [],
        fullName: name,
        status: 'passed',
        title: name,
        failureMessages: [],
      }))
    )
    for (const name of fs.readdirSync(original))
      assert.deepEqual(
        fs.readFileSync(path.join(fixture, name)),
        fs.readFileSync(path.join(original, name))
      )
    return { mode, close, forced, observations, authoredSourcesHeld: true }
  } catch (error) {
    process.stderr.write(Buffer.concat(stdout))
    process.stderr.write(Buffer.concat(stderr))
    throw error
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
    console.error(error)
    process.exitCode = 1
  }
)
