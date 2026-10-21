const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { spawnSync } = require('node:child_process')
const repo = path.resolve(__dirname, '../../..')
const source = path.join(__dirname, 'fixtures/js-conditionals')
const digest = (file) =>
  crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
let cases = 0,
  completeReports = 0
for (const mode of ['development', 'production']) {
  const fixture = fs.mkdtempSync(path.join(repo, '.next-test-conditional-'))
  try {
    const held = {}
    for (const name of ['subject.mjs', 'contract.test.mjs']) {
      fs.copyFileSync(
        path.join(source, name + '.txt'),
        path.join(fixture, name)
      )
      held[name] = digest(path.join(fixture, name))
    }
    fs.writeFileSync(
      path.join(fixture, 'package.json'),
      JSON.stringify({ private: true, type: 'module' })
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
            name: 'conditional-control',
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
        path.join(repo, 'packages/next/dist/bin/next'),
        'test',
        fixture,
        '--run',
        '--reporter=json',
        '--outputFile=result.json',
        '--coverage',
        '--coverage.reporter=json',
        '--coverage.include=subject.mjs',
      ],
      { cwd: fixture, env, encoding: 'utf8', timeout: 40000 }
    )
    if (process.env.NEXT_TESTING_CONDITIONAL_EVIDENCE) {
      const out = path.join(process.env.NEXT_TESTING_CONDITIONAL_EVIDENCE, mode)
      fs.mkdirSync(out, { recursive: true })
      fs.writeFileSync(path.join(out, 'stdout.log'), child.stdout || '')
      fs.writeFileSync(path.join(out, 'stderr.log'), child.stderr || '')
      for (const name of ['result.json', 'coverage/coverage-final.json'])
        if (fs.existsSync(path.join(fixture, name)))
          fs.copyFileSync(
            path.join(fixture, name),
            path.join(out, path.basename(name))
          )
    }
    assert.equal(child.error, undefined)
    assert.equal(child.signal, null)
    assert.equal(child.status, 0, child.stdout + child.stderr)
    const result = JSON.parse(
      fs.readFileSync(path.join(fixture, 'result.json'))
    )
    assert.equal(result.success, true)
    assert.equal(result.numTotalTests, 1)
    assert.equal(result.numPassedTests, 1)
    assert.equal(result.numFailedTests, 0)
    assert.deepEqual(
      result.testResults.flatMap((file) =>
        file.assertionResults.map(({ fullName, status, failureMessages }) => ({
          fullName,
          status,
          failureMessages,
        }))
      ),
      [
        {
          fullName: 'ordinary exact branch control',
          status: 'passed',
          failureMessages: [],
        },
      ]
    )
    const coverage = JSON.parse(
      fs.readFileSync(path.join(fixture, 'coverage/coverage-final.json'))
    )
    const portable = Object.fromEntries(
      Object.entries(coverage).map(([file, data]) => [
        path.basename(file),
        { ...data, path: path.basename(file) },
      ])
    )
    assert.deepEqual(
      portable,
      JSON.parse(
        fs.readFileSync(path.join(source, 'pristine-' + mode + '.json'))
      )
    )
    for (const [name, hash] of Object.entries(held))
      assert.equal(digest(path.join(fixture, name)), hash)
    cases++
    completeReports++
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true })
  }
}
console.log(JSON.stringify({ profiles: 2, cases, completeReports }))
