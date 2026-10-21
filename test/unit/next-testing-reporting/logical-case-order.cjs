const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const repo = path.resolve(__dirname, '../../..')
const cliRepo = process.argv[2] || repo
const source = path.join(__dirname, 'fixtures/case-result-cohort')
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))
async function deadline(promise, ms, message) {
  let timer
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}
async function main() {
  let cases = 0,
    callbacks = 0
  for (const [mode, cohort] of [
    ['development', false],
    ['production', false],
    ['development', true],
  ]) {
    const label = mode + (cohort ? '-cohort' : ''),
      fixture = fs.mkdtempSync(path.join(repo, '.next-test-case-order-'))
    let child,
      closed = false,
      completion,
      stdout = '',
      stderr = ''
    try {
      for (const name of ['first.test.mjs', 'second.test.mjs', 'reporter.mjs'])
        fs.copyFileSync(
          path.join(source, name + '.txt'),
          path.join(fixture, name)
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
          projects: [
            {
              name: 'case-rejection',
              environment: 'node',
              mode,
              include: ['*.test.mjs'],
              isolate: !cohort,
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
      child = spawn(
        process.execPath,
        [
          path.join(cliRepo, 'packages/next/dist/bin/next'),
          'test',
          fixture,
          '--run',
          '--maxWorkers=1',
          '--reporter=./reporter.mjs',
          '--reporter=json',
          '--outputFile=result.json',
        ],
        {
          cwd: fixture,
          env,
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: process.platform !== 'win32',
        }
      )
      child.stdout.on('data', (data) => {
        stdout += data
      })
      child.stderr.on('data', (data) => {
        stderr += data
      })
      completion = new Promise((resolve, reject) => {
        child.once('error', reject)
        child.once('close', (code, signal) => {
          closed = true
          resolve({ code, signal })
        })
      })
      void completion.catch(() => {})
      const ended = await deadline(
        completion,
        40000,
        'Case/module reporter did not close after actual owned file completion'
      )
      assert.equal(ended.signal, null)
      assert.equal(ended.code, 1, stdout + stderr)
      const rows = read(path.join(fixture, 'rows.json')),
        report = read(path.join(fixture, 'result.json'))
      if (env.NEXT_TESTING_LOGICAL_REPORTER_EVIDENCE) {
        const out = path.join(
          env.NEXT_TESTING_LOGICAL_REPORTER_EVIDENCE,
          'order-' + label
        )
        fs.mkdirSync(out, { recursive: true })
        for (const name of ['rows.json', 'result.json'])
          fs.copyFileSync(path.join(fixture, name), path.join(out, name))
        fs.writeFileSync(path.join(out, 'stdout.log'), stdout)
        fs.writeFileSync(path.join(out, 'stderr.log'), stderr)
      }
      assert.deepEqual(
        rows,
        read(path.join(source, 'pristine-' + label + '.json'))
      )
      assert.equal(report.success, true)
      assert.equal(report.numTotalTests, 2)
      assert.equal(report.numPassedTests, 2)
      assert.equal(report.numFailedTests, 0)
      assert.equal(
        fs.readFileSync(path.join(fixture, 'first-module-closed.txt'), 'utf8'),
        'released'
      )
      const events = report.next.events,
        files = events.filter((event) => event.type === 'file-start'),
        logical = events.flatMap((event) =>
          event.type === 'task-update' ? event.caseResults : []
        )
      assert.equal(logical.length, 2)
      assert.equal(new Set(logical.map((result) => result.caseId)).size, 2)
      assert.ok(logical.every((result) => result.status === 'passed'))
      assert.equal(
        events.filter((event) => event.type === 'case-end').length,
        2
      )
      assert.equal(
        events.filter((event) => event.type === 'file-end').length,
        2
      )
      const observed = events.filter(
        (event) => event.type === 'module-complete'
      )
      assert.equal(observed.length, cohort ? 2 : 0)
      for (const event of events.filter((event) =>
        ['file-collected', 'task-update', 'module-complete'].includes(
          event.type
        )
      ))
        assert.equal(
          event.revision,
          files.find((file) => file.entry.id === event.entryId).revision
        )
      if (cohort)
        assert.ok(
          observed.every(
            (event) =>
              events.indexOf(event) <
              events.findIndex((file) => file.type === 'file-end')
          )
        )
      for (const name of ['first.test.mjs', 'second.test.mjs', 'reporter.mjs'])
        assert.deepEqual(
          fs.readFileSync(path.join(fixture, name)),
          fs.readFileSync(path.join(source, name + '.txt'))
        )
      cases += 2
      callbacks += rows.filter((row) => row.event === 'case-result').length
    } finally {
      if (child && !closed && child.pid) {
        try {
          process.kill(
            process.platform === 'win32' ? child.pid : -child.pid,
            'SIGTERM'
          )
        } catch (error) {
          if (error.code !== 'ESRCH') throw error
        }
        await deadline(
          completion,
          5000,
          'Case/module reporter did not join owned cleanup'
        )
      }
      fs.rmSync(fixture, { recursive: true, force: true })
    }
  }
  console.log(
    JSON.stringify({
      profiles: 3,
      cases,
      callbacks,
      followingBodyRequiresActualModuleCallback: true,
    })
  )
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
