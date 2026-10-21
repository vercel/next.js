const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const repo = path.resolve(__dirname, '../../..')
const source = path.join(__dirname, 'fixtures/module-end-failure')
let cases = 0
let callbacks = 0
for (const mode of ['development', 'production']) {
  const fixture = fs.mkdtempSync(path.join(repo, '.next-test-module-failure-'))
  try {
    for (const name of [
      'first.test.mjs.txt',
      'second.test.mjs.txt',
      'reporter.mjs',
    ])
      fs.copyFileSync(
        path.join(source, name),
        path.join(fixture, name.replace(/\.txt$/, ''))
      )
    fs.writeFileSync(
      path.join(fixture, 'package.json'),
      '{"type":"module","private":true}\n'
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
            name: 'module-failure',
            environment: 'node',
            mode,
            include: ['*.test.mjs'],
          },
        ],
      })
    )
    const env = { ...process.env, NODE_ENV: mode, NEXT_TELEMETRY_DISABLED: '1' }
    delete env.CI
    const child = spawnSync(
      process.execPath,
      [
        path.join(repo, 'packages/next/dist/bin/next'),
        'test',
        fixture,
        '--run',
        '--maxWorkers=1',
        '--reporter=./reporter.mjs',
        '--reporter=json',
        '--outputFile=result.json',
      ],
      { cwd: fixture, env, encoding: 'utf8', timeout: 40000 }
    )
    assert.equal(child.error, undefined)
    assert.equal(child.signal, null)
    const report = JSON.parse(
      fs.readFileSync(path.join(fixture, 'result.json'), 'utf8')
    )
    const rows = JSON.parse(
      fs.readFileSync(path.join(fixture, 'rows.json'), 'utf8')
    )
    if (env.NEXT_TESTING_MODULE_REPORTER_EVIDENCE) {
      const directory = path.join(
        env.NEXT_TESTING_MODULE_REPORTER_EVIDENCE,
        'failure-' + mode
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
    assert.equal(child.status, 1)
    assert.equal(report.success, true)
    assert.equal(report.numTotalTests, 2)
    assert.equal(report.numPassedTests, 2)
    assert.equal(report.numFailedTests, 0)
    assert.deepEqual(
      rows,
      JSON.parse(fs.readFileSync(path.join(source, 'pristine.json'), 'utf8'))
    )
    assert(
      report.next.events
        .filter((event) => event.type === 'file-start')
        .every((event) => event.entry.profile.mode === mode)
    )
    for (const name of [
      'first.test.mjs.txt',
      'second.test.mjs.txt',
      'reporter.mjs',
    ])
      assert.deepEqual(
        fs.readFileSync(path.join(fixture, name.replace(/\.txt$/, ''))),
        fs.readFileSync(path.join(source, name))
      )
    cases += 2
    callbacks += 2
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true })
  }
}
process.stdout.write(JSON.stringify({ cases, callbacks, profiles: 2 }) + '\n')
