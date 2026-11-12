const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const repo = path.resolve(__dirname, '../../..')
const cliRepo = process.argv[2] || repo
const source = path.join(__dirname, 'fixtures/module-end-reporter')
let cases = 0
let callbacks = 0
for (const mode of ['development', 'production']) {
  const fixture = fs.mkdtempSync(path.join(repo, '.next-test-module-reporter-'))
  try {
    for (const name of ['contract.test.mjs.txt', 'reporter.mjs'])
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
            name: 'live-case',
            environment: 'node',
            mode,
            include: ['contract.test.mjs'],
          },
        ],
      })
    )
    const env = { ...process.env, NODE_ENV: mode, NEXT_TELEMETRY_DISABLED: '1' }
    delete env.CI
    const child = spawnSync(
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
      { cwd: fixture, env, encoding: 'utf8', timeout: 40000 }
    )
    assert.equal(child.error, undefined)
    assert.equal(child.signal, null)
    const resultFile = path.join(fixture, 'result.json')
    const report = fs.existsSync(resultFile)
      ? JSON.parse(fs.readFileSync(resultFile, 'utf8'))
      : null
    const rowsFile = path.join(fixture, 'module-rows.json')
    const rows = fs.existsSync(rowsFile)
      ? JSON.parse(fs.readFileSync(rowsFile, 'utf8'))
      : null
    if (env.NEXT_TESTING_MODULE_REPORTER_EVIDENCE) {
      const directory = path.join(
        env.NEXT_TESTING_MODULE_REPORTER_EVIDENCE,
        mode
      )
      fs.mkdirSync(directory, { recursive: true })
      fs.writeFileSync(
        path.join(directory, 'report.json'),
        JSON.stringify(report, null, 2)
      )
      fs.writeFileSync(
        path.join(directory, 'rows.json'),
        JSON.stringify(rows, null, 2)
      )
      fs.writeFileSync(path.join(directory, 'stdout.log'), child.stdout)
      fs.writeFileSync(path.join(directory, 'stderr.log'), child.stderr)
    }
    assert.ok(report, child.stderr || child.stdout)
    assert.equal(child.status, 1)
    assert.equal(report.numTotalTests, 6, JSON.stringify(report))
    assert.equal(report.numPassedTests, 3)
    assert.equal(report.numFailedTests, 1)
    assert.equal(report.numPendingTests, 1)
    assert.equal(report.numTodoTests, 1)
    assert.deepEqual(
      rows,
      JSON.parse(
        fs.readFileSync(path.join(source, 'pristine-' + mode + '.json'), 'utf8')
      )
    )
    assert.equal(
      report.next.events.find((event) => event.type === 'file-start').entry
        .profile.mode,
      mode
    )
    for (const name of ['contract.test.mjs.txt', 'reporter.mjs'])
      assert.deepEqual(
        fs.readFileSync(path.join(fixture, name.replace(/\.txt$/, ''))),
        fs.readFileSync(path.join(source, name))
      )
    cases += 6
    callbacks++
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true })
  }
}
process.stdout.write(JSON.stringify({ cases, callbacks, profiles: 2 }) + '\n')
