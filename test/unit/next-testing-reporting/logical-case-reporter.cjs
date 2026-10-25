const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const repo = path.resolve(__dirname, '../../..')
const cliRepo = process.argv[2] || repo
const source = path.join(__dirname, 'fixtures/case-result-reporter')
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))
function earlyRows(fixture, child, closed) {
  return new Promise((resolve, reject) => {
    let observer
    let settled = false
    const observedFiles = [
      path.join(fixture, 'held-body.txt'),
      path.join(fixture, 'live-rows.json'),
    ]
    const timer = setTimeout(
      () =>
        finish(
          new Error(
            'Actual first result must arrive while second body is genuinely held'
          )
        ),
      15000
    )
    const finish = (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      observer?.close()
      for (const file of observedFiles) fs.unwatchFile(file, inspect)
      child.removeListener('close', ended)
      if (error) reject(error)
      else resolve()
    }
    const ended = () =>
      finish(new Error('Reporter command ended before the live callback'))
    const inspect = () => {
      if (settled) return
      try {
        if (!fs.existsSync(path.join(fixture, 'held-body.txt'))) return
        const rows = read(path.join(fixture, 'live-rows.json'))
        if (rows.filter((row) => row.event === 'case-result').length === 1)
          finish()
      } catch (error) {
        if (error.code !== 'ENOENT' && !(error instanceof SyntaxError))
          finish(error)
      }
    }
    child.once('close', ended)
    observer = fs.watch(fixture, inspect)
    // Notifications may be coalesced while the real callback bytes are ready.
    for (const file of observedFiles)
      fs.watchFile(file, { interval: 25, persistent: false }, inspect)
    inspect()
    if (closed()) ended()
  })
}
async function deadline(promise, milliseconds, message) {
  let timer
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), milliseconds)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}
async function main() {
  let cases = 0
  for (const mode of ['development', 'production']) {
    const fixture = fs.mkdtempSync(
      path.join(repo, '.next-test-logical-reporter-')
    )
    let child,
      didClose = false,
      completion,
      stdout = '',
      stderr = ''
    try {
      for (const name of ['contract.test.mjs.txt', 'reporter.mjs.txt'])
        fs.copyFileSync(
          path.join(source, name),
          path.join(fixture, name.replace(/\.txt$/, ''))
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
              name: 'case-result',
              environment: 'node',
              mode,
              include: ['contract.test.mjs'],
            },
          ],
        })
      )
      fs.writeFileSync(path.join(fixture, 'gate.txt'), 'closed')
      const env = {
        ...process.env,
        NODE_ENV: mode,
        NEXT_TELEMETRY_DISABLED: '1',
        CASE_RESULT_GATE: path.join(fixture, 'gate.txt'),
        CASE_RESULT_MARKER: path.join(fixture, 'held-body.txt'),
      }
      delete env.CI
      child = spawn(
        process.execPath,
        [
          path.join(cliRepo, 'packages/next/dist/bin/next'),
          'test',
          fixture,
          '--run',
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
          didClose = true
          resolve({ code, signal })
        })
      })
      void completion.catch(() => {})
      await earlyRows(fixture, child, () => didClose)
      fs.copyFileSync(
        path.join(fixture, 'live-rows.json'),
        path.join(fixture, 'before-release-rows.json')
      )
      fs.copyFileSync(
        path.join(fixture, 'raw-current-results.json'),
        path.join(fixture, 'before-release-raw-results.json')
      )
      assert.deepEqual(
        read(path.join(fixture, 'before-release-rows.json')),
        read(path.join(source, 'before-release-' + mode + '.json'))
      )
      assert.deepEqual(
        read(path.join(fixture, 'before-release-raw-results.json')),
        read(path.join(source, 'before-release-raw-' + mode + '.json'))
      )
      fs.writeFileSync(path.join(fixture, 'gate.txt'), 'released')
      const ended = await deadline(
        completion,
        15000,
        'Reporter command did not close after actual body release'
      )
      assert.equal(ended.signal, null)
      assert.equal(ended.code, 0, stderr || stdout)
      const finalRows = read(path.join(fixture, 'final-rows.json'))
      const referenceRows = read(
        path.join(source, 'pristine-' + mode + '.json')
      )
      // The actual module can finish before or after the last case callback.
      // Keep the first callback and all terminal module/run rows exact.
      const lastCaseModuleState = finalRows[2]?.module?.state
      assert.ok(
        lastCaseModuleState === 'pending' || lastCaseModuleState === 'passed'
      )
      referenceRows[2].module.state = lastCaseModuleState
      assert.deepEqual(finalRows, referenceRows)
      const report = read(path.join(fixture, 'result.json'))
      assert.equal(report.numPassedTests, 2)
      assert.equal(report.success, true)
      const facts = report.next.events
      const started = facts.find((event) => event.type === 'file-start')
      const collected = facts.filter((event) => event.type === 'file-collected')
      const updates = facts.filter((event) => event.type === 'task-update')
      assert.equal(collected.length, 1)
      assert.ok(updates.length)
      for (const event of [...collected, ...updates])
        assert.equal(event.revision, started.revision)
      const logical = updates.flatMap((event) => event.caseResults)
      assert.equal(logical.length, 2)
      assert.equal(new Set(logical.map((result) => result.caseId)).size, 2)
      assert.equal(facts.filter((event) => event.type === 'case-end').length, 2)
      for (const name of ['contract.test.mjs.txt', 'reporter.mjs.txt'])
        assert.deepEqual(
          fs.readFileSync(path.join(fixture, name.replace(/\.txt$/, ''))),
          fs.readFileSync(path.join(source, name))
        )
      cases += 2
    } finally {
      if (child && !didClose) {
        try {
          process.kill(
            process.platform === 'win32' ? child.pid : -child.pid,
            'SIGTERM'
          )
        } catch (error) {
          if (error.code !== 'ESRCH') throw error
        }
        try {
          await deadline(completion, 5000, 'Reporter cleanup did not close')
        } catch (error) {
          try {
            process.kill(
              process.platform === 'win32' ? child.pid : -child.pid,
              'SIGKILL'
            )
          } catch (killError) {
            if (killError.code !== 'ESRCH') throw killError
          }
          await completion
          throw error
        }
      }
      const evidence = process.env.NEXT_TESTING_LOGICAL_REPORTER_EVIDENCE
      if (evidence) {
        const directory = path.join(evidence, mode)
        fs.mkdirSync(directory, { recursive: true })
        for (const name of fs.readdirSync(fixture))
          if (fs.statSync(path.join(fixture, name)).isFile())
            fs.copyFileSync(
              path.join(fixture, name),
              path.join(directory, name)
            )
        fs.writeFileSync(path.join(directory, 'stdout.log'), stdout)
        fs.writeFileSync(path.join(directory, 'stderr.log'), stderr)
      }
      fs.rmSync(fixture, { recursive: true, force: true })
    }
  }
  process.stdout.write(
    JSON.stringify({
      cases,
      profiles: 2,
      earlyCallbacks: 2,
      fullTaskRows: true,
    }) + '\n'
  )
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
