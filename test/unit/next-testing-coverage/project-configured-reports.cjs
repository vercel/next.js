const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { createHash } = require('node:crypto')
const repo =
  process.env.NEXT_TEST_COVERAGE_CONSUMER_ROOT ||
  path.resolve(__dirname, '../../..')
const source = path.join(
  __dirname,
  '../app-dir/next-testing-stable-release-gaps/fixtures/standard-coverage'
)
const expected = require('./project-configured-coverage.expected.json')
const base = {
  provider: 'v8',
  enabled: true,
  include: ['*.mjs'],
  exclude: ['contract.case.mjs', 'excluded.mjs'],
}
let completeReports = 0
for (const mode of ['development', 'production'])
  for (const [name, coverage, flags, directory] of [
    ['defaults', base, [], 'coverage'],
    [
      'disabled',
      { ...base, reporter: ['json'], reportsDirectory: 'disabled-coverage' },
      ['--no-coverage'],
      'disabled-coverage',
    ],
    [
      'explicit',
      {
        ...base,
        reporter: ['json', 'json-summary', 'text-summary', 'lcovonly'],
        reportsDirectory: 'configured-coverage',
        thresholds: { lines: -99 },
        clean: true,
      },
      [],
      'configured-coverage',
    ],
    [
      'clean-false',
      {
        ...base,
        reporter: ['json'],
        reportsDirectory: 'preserved-coverage',
        clean: false,
      },
      [],
      'preserved-coverage',
    ],
    [
      'cli-override',
      {
        ...base,
        enabled: false,
        reporter: ['lcovonly'],
        reportsDirectory: 'wrong-directory',
        include: ['excluded.mjs'],
        thresholds: { lines: 100, branches: -99 },
        clean: false,
      },
      [
        '--coverage',
        '--coverage.reporter=json',
        '--coverage.reportsDirectory=cli-coverage',
        '--coverage.include=subject.mjs',
        '--coverage.thresholds.lines=0',
      ],
      'cli-coverage',
    ],
  ]) {
    const fixture = fs.mkdtempSync(
      path.join(repo, '.next-test-project-coverage-')
    )
    try {
      for (const file of fs.readdirSync(source))
        if (fs.statSync(path.join(source, file)).isFile())
          fs.copyFileSync(path.join(source, file), path.join(fixture, file))
      fs.writeFileSync(
        path.join(fixture, 'next.config.mjs'),
        'export default {}\n'
      )
      fs.writeFileSync(
        path.join(fixture, 'next.test.config.json'),
        JSON.stringify({
          test: { include: ['contract.case.mjs'], mode, coverage },
        })
      )
      fs.mkdirSync(path.join(fixture, directory))
      fs.writeFileSync(
        path.join(fixture, directory, 'sentinel.txt'),
        'keep-me\n'
      )
      const child = spawnSync(
        process.execPath,
        [
          path.join(repo, 'packages/next/dist/bin/next'),
          'test',
          fixture,
          '--run',
          '--reporter=json',
          '--outputFile=result.json',
          ...flags,
        ],
        {
          cwd: fixture,
          env: { ...process.env, NODE_ENV: mode, NEXT_TELEMETRY_DISABLED: '1' },
          encoding: 'utf8',
          timeout: 40000,
        }
      )
      assert.equal(child.error, undefined)
      assert.equal(child.signal, null)
      assert.equal(child.status, 0, child.stdout + child.stderr)
      const pristine = expected.profiles.find(
        (r) => r.mode === mode && r.name === name
      )
      const result = JSON.parse(
        fs.readFileSync(path.join(fixture, 'result.json'))
      )
      const cases = result.testResults.flatMap((file) =>
        file.assertionResults.map(({ fullName, status, failureMessages }) => ({
          fullName,
          status,
          failureMessages,
        }))
      )
      assert.deepEqual(cases, pristine.cases)
      if (name === 'disabled') {
        assert.equal(pristine.coverage, null)
        assert.deepEqual(fs.readdirSync(path.join(fixture, directory)), [
          'sentinel.txt',
        ])
      } else {
        const map = JSON.parse(
          fs.readFileSync(path.join(fixture, directory, 'coverage-final.json'))
        )
        const canonical = Object.fromEntries(
          Object.entries(map).map(([file, value]) => [
            path.basename(file),
            { ...value, path: path.basename(file) },
          ])
        )
        assert.deepEqual(canonical, pristine.coverage)
        assert.equal(
          fs.existsSync(path.join(fixture, directory, 'sentinel.txt')),
          coverage.clean === false
        )
        if (name === 'defaults') {
          for (const file of [
            'index.html',
            'subject.mjs.html',
            'unimported.mjs.html',
            'clover.xml',
            'base.css',
          ])
            assert.equal(
              fs.existsSync(path.join(fixture, directory, file)),
              true,
              file
            )
          assert.match(
            fs.readFileSync(
              path.join(fixture, directory, 'index.html'),
              'utf8'
            ),
            /subject\.mjs/
          )
          assert.match(
            fs.readFileSync(
              path.join(fixture, directory, 'clover.xml'),
              'utf8'
            ),
            /subject\.mjs/
          )
          assert.match(child.stdout, /All files/)
          for (const [file, hash] of Object.entries(pristine.assetHashes))
            assert.equal(
              createHash('sha256')
                .update(fs.readFileSync(path.join(fixture, directory, file)))
                .digest('hex'),
              hash,
              file
            )
          const html = fs.readFileSync(
            path.join(fixture, directory, 'index.html'),
            'utf8'
          )
          for (const [, link] of html.matchAll(/(?:href|src)="([^"#:]+)"/g))
            assert.equal(
              fs.existsSync(path.join(fixture, directory, link.split('?')[0])),
              true,
              link
            )
        }
        if (name === 'explicit') {
          assert.equal(
            fs.existsSync(path.join(fixture, directory, 'lcov.info')),
            true
          )
          assert.equal(
            fs.existsSync(
              path.join(fixture, directory, 'coverage-summary.json')
            ),
            true
          )
          assert.match(child.stdout, /Coverage summary/)
        }
        completeReports++
      }
      for (const file of fs.readdirSync(source))
        if (fs.statSync(path.join(source, file)).isFile())
          assert.deepEqual(
            fs.readFileSync(path.join(fixture, file)),
            fs.readFileSync(path.join(source, file))
          )
    } finally {
      fs.rmSync(fixture, { recursive: true, force: true })
    }
  }
process.stdout.write(
  JSON.stringify({
    profiles: 10,
    cases: 10,
    completeReports,
    genuineReports: 8,
  }) + '\n'
)
