const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const crypto = require('node:crypto')
const repo = path.resolve(__dirname, '../../..')
const source = path.join(__dirname, 'fixtures/lcovonly')
const digest = (file) =>
  crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
let cases = 0,
  completeCoverageReports = 0,
  exactLcovReports = 0
for (const mode of ['development', 'production'])
  for (const only of [false, true]) {
    const fixture = fs.mkdtempSync(path.join(repo, '.next-test-lcovonly-'))
    try {
      const held = {}
      for (const name of [
        'subject.js',
        'untouched.js',
        'contract.test.mjs',
        'package.json',
      ]) {
        fs.copyFileSync(
          path.join(source, name + '.txt'),
          path.join(fixture, name)
        )
        held[name] = digest(path.join(fixture, name))
      }
      fs.writeFileSync(
        path.join(fixture, 'next.config.mjs'),
        'export default {}\n'
      )
      fs.writeFileSync(
        path.join(fixture, 'next.test.config.json'),
        JSON.stringify({
          projects: [
            {
              name: 'coverage-reporters',
              environment: 'node',
              mode,
              include: ['contract.test.mjs'],
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
          ...(only ? [] : ['--coverage.reporter=json']),
          '--coverage.reporter=lcovonly',
          '--coverage.include=subject.js',
          '--coverage.include=untouched.js',
        ],
        { cwd: fixture, env, encoding: 'utf8', timeout: 40000 }
      )
      assert.equal(child.error, undefined)
      assert.equal(child.signal, null)
      assert.equal(child.status, 0, child.stdout + child.stderr)
      const result = JSON.parse(
        fs.readFileSync(path.join(fixture, 'result.json'))
      )
      assert.equal(result.success, true)
      assert.equal(result.numTotalTests, 2)
      assert.equal(result.numPassedTests, 2)
      assert.deepEqual(
        result.testResults.flatMap((file) =>
          file.assertionResults.map(
            ({ fullName, status, failureMessages }) => ({
              fullName,
              status,
              failureMessages,
            })
          )
        ),
        JSON.parse(
          fs.readFileSync(path.join(source, 'pristine-cases-' + mode + '.json'))
        )
      )
      const coverage = path.join(fixture, 'coverage')
      assert.deepEqual(
        fs.readdirSync(coverage).sort(),
        only ? ['lcov.info'] : ['coverage-final.json', 'lcov.info']
      )
      assert.deepEqual(
        fs.readFileSync(path.join(coverage, 'lcov.info')),
        fs.readFileSync(path.join(source, 'pristine-' + mode + '.lcov.txt'))
      )
      exactLcovReports++
      if (!only) {
        const report = JSON.parse(
          fs.readFileSync(path.join(coverage, 'coverage-final.json'))
        )
        const portable = Object.fromEntries(
          Object.entries(report).map(([file, data]) => [
            path.basename(file),
            { ...data, path: path.basename(file) },
          ])
        )
        assert.deepEqual(
          portable,
          JSON.parse(
            fs.readFileSync(
              path.join(source, 'pristine-coverage-' + mode + '.json')
            )
          )
        )
        completeCoverageReports++
      }
      for (const [name, hash] of Object.entries(held))
        assert.equal(digest(path.join(fixture, name)), hash)
      cases += 2
    } finally {
      fs.rmSync(fixture, { recursive: true, force: true })
    }
  }
console.log(
  JSON.stringify({
    profiles: 2,
    flavors: 2,
    cases,
    completeCoverageReports,
    exactLcovReports,
  })
)
