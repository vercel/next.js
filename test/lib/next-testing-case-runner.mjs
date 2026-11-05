import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../e2e/app-dir/next-testing-package/process-supervisor.mjs'

/** Run a fixture whose test bodies contain their behavioral assertions. */
export async function runCompilerCase({
  repo,
  output,
  mode,
  files,
  packages = [],
  expectedNames,
  expectedCount = expectedNames?.length,
  expectedExit = 0,
  timeoutMs = 120000,
  config,
  env = {},
  check,
}) {
  assert(
    expectedNames !== undefined ||
      Number.isInteger(expectedCount) ||
      typeof check === 'function',
    'Specify expected case names/count or a focused report check'
  )
  assert(
    expectedExit === 0 || typeof check === 'function',
    'Failure scenarios require a focused report check'
  )
  fs.mkdirSync(output, { recursive: true })
  const fixture = fs.mkdtempSync(path.join(repo, '.next-test-case-'))
  let closed = false
  let started = false
  try {
    for (const { target, bytes } of files) {
      const destination = path.join(fixture, target)
      fs.mkdirSync(path.dirname(destination), { recursive: true })
      fs.writeFileSync(destination, bytes)
    }
    if (!fs.existsSync(path.join(fixture, 'package.json')))
      fs.writeFileSync(
        path.join(fixture, 'package.json'),
        '{"type":"module","private":true}\n'
      )
    if (!files.some(({ target }) => target.startsWith('next.config.')))
      fs.writeFileSync(
        path.join(fixture, 'next.config.mjs'),
        'export default ' +
          JSON.stringify({
            turbopack: { root: repo },
            serverExternalPackages: packages,
          }) +
          '\n'
      )
    if (
      config !== undefined ||
      !files.some(({ target }) => target.startsWith('next.test.config.'))
    )
      fs.writeFileSync(
        path.join(fixture, 'next.test.config.json'),
        JSON.stringify(
          config ?? {
            test: {
              maxWorkers: 1,
              mode,
              environment: 'node',
              include: ['*.test.{js,mjs,cjs,jsx,ts,tsx}'],
              testTimeout: 10000,
              hookTimeout: 10000,
            },
          }
        ) + '\n'
      )
    const modules = path.join(fixture, 'node_modules')
    fs.mkdirSync(modules, { recursive: true })
    for (const name of fs.readdirSync(path.join(repo, 'node_modules'))) {
      const target = path.join(modules, name)
      if (fs.existsSync(target)) continue
      if (['.vite', '.vite-temp', '.cache', '.vitest-cache'].includes(name))
        fs.mkdirSync(target)
      else fs.symlinkSync(path.join(repo, 'node_modules', name), target, 'dir')
    }
    const reportFile = path.join(output, 'report.json')
    const childEnv = {
      ...process.env,
      NODE_ENV: mode,
      NEXT_TELEMETRY_DISABLED: '1',
      FORCE_COLOR: '0',
      TURBO_TASKS_AVAILABLE_PARALLELISM: '4',
      ...env,
    }
    for (const name of [
      'CI',
      'NODE_OPTIONS',
      'NODE_PATH',
      'NEXT_TEST_NATIVE_DIR',
      'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
    ])
      delete childEnv[name]
    const load = createRequire(path.join(repo, 'package.json'))
    started = true
    const owner = await runOwnedNode(
      [
        load.resolve('next/dist/bin/next'),
        'test',
        fixture,
        '--run',
        '--reporter=json',
        '--outputFile=' + reportFile,
      ],
      {
        cwd: fixture,
        env: childEnv,
        auditDir: path.join(output, 'owners'),
        timeoutMs,
      }
    )
    fs.writeFileSync(path.join(output, 'stdout.log'), owner.stdout)
    fs.writeFileSync(path.join(output, 'stderr.log'), owner.stderr)
    assertOwnedNodeCompleted(owner, 'Fixture test command')
    closed = true
    assert.equal(owner.status, expectedExit, owner.stdout + owner.stderr)
    const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'))
    const cases = report.testResults.flatMap((file) => file.assertionResults)
    if (expectedNames)
      assert.deepEqual(
        cases.map((test) => test.fullName),
        expectedNames
      )
    if (expectedCount !== undefined) assert.equal(cases.length, expectedCount)
    if (expectedExit === 0) assert.equal(report.success, true)
    // A custom check owns case states/errors, including skips and recovered retries.
    if (expectedExit === 0 && !check) {
      assert(cases.every((test) => test.status === 'passed'))
      assert(cases.every((test) => test.failureMessages.length === 0))
      assert(report.testResults.every((file) => file.message === ''))
    }
    await check?.(report, {
      fixture,
      stdout: owner.stdout,
      stderr: owner.stderr,
    })
    return { mode, cases: cases.length, passed: true }
  } finally {
    if (!started || closed) fs.rmSync(fixture, { recursive: true, force: true })
  }
}
