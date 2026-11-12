import { readExpectedCoverageFixture } from './expected-coverage-fixtures.cjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'

const [consumerArg, outputArg] = process.argv.slice(2)
assert(consumerArg && outputArg)
const consumer = resolve(consumerArg),
  output = resolve(outputArg),
  load = createRequire(join(consumer, 'package.json')),
  here = dirname(fileURLToPath(import.meta.url)),
  expected = readExpectedCoverageFixture(
    join(here, 'fixtures/standard-reporters/expected.json')
  ),
  selected = process.argv
    .find((argument) => argument.startsWith('--profiles='))
    ?.slice('--profiles='.length)
    .split(','),
  results = []
fs.mkdirSync(output, { recursive: true })
for (const profile of expected.rows.filter(
  (profile) => !selected || selected.includes(profile.name)
)) {
  const fixture = fs.mkdtempSync(join(consumer, '.next-standard-reporters-')),
    directory = join(fixture, 'coverage'),
    destination = join(output, profile.name)
  fs.mkdirSync(destination)
  let joined = false
  try {
    for (const name of [
      'contract.test.mjs',
      'subject.mjs',
      'unimported.mjs',
      'fully.mjs',
      'full.test.mjs',
      'failed.case.mjs',
      'package.json',
    ])
      fs.copyFileSync(
        join(here, 'fixtures/standard-reporters/sources', name + '.txt'),
        join(fixture, name)
      )
    fs.writeFileSync(join(fixture, 'vitest.config.mjs'), profile.config)
    fs.writeFileSync(
      join(fixture, 'next.config.mjs'),
      'export default ' +
        JSON.stringify({ turbopack: { root: consumer } }) +
        '\n'
    )
    if (profile.input.includes('clean-')) {
      fs.mkdirSync(directory)
      fs.writeFileSync(
        join(directory, 'prior-report.txt'),
        'previous actual report\n'
      )
    }
    const env = {
      ...process.env,
      NODE_ENV: 'development',
      NEXT_TELEMETRY_DISABLED: '1',
      CI: '1',
      FORCE_COLOR: '0',
      TURBO_TASKS_AVAILABLE_PARALLELISM: '4',
    }
    for (const name of [
      'NODE_OPTIONS',
      'NODE_PATH',
      'NEXT_TEST_NATIVE_DIR',
      'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
    ])
      delete env[name]
    const owner = await runOwnedNode(
      [
        load.resolve('next/dist/bin/next'),
        'test',
        fixture,
        '--run',
        '--reporter=json',
        '--outputFile=' + join(destination, 'cases.json'),
        ...(profile.input === 'cli'
          ? [
              '--coverage',
              '--coverage.provider=v8',
              '--coverage.reporter=json',
              '--coverage.reporter=' + profile.reporter,
            ]
          : []),
      ],
      {
        cwd: fixture,
        env,
        auditDir: join(destination, 'owners'),
        timeoutMs: 120000,
      }
    )
    fs.writeFileSync(join(destination, 'stdout.log'), owner.stdout)
    fs.writeFileSync(join(destination, 'stderr.log'), owner.stderr)
    assertOwnedNodeCompleted(owner, 'standard reporter ' + profile.name)
    joined = true
    assert.equal(owner.status, profile.exitCode, owner.stdout + owner.stderr)
    const report = JSON.parse(fs.readFileSync(join(destination, 'cases.json'))),
      tests = report.testResults.flatMap((file) => file.assertionResults)
    if (profile.input.includes('failed-')) {
      assert.deepEqual(
        tests.map((test) => [test.fullName, test.status]),
        [['failed body still owns complete coverage', 'failed']]
      )
      assert.equal(tests[0].failureMessages.length, 1)
      assert.match(tests[0].failureMessages[0], /expected 1 to be 2/)
    } else {
      assert.deepEqual(
        tests.map((test) => [test.fullName, test.status]).sort(),
        [
          ['fully covered control', 'passed'],
          ['only true branch is executed', 'passed'],
        ]
      )
      for (const test of tests) assert.deepEqual(test.failureMessages, [])
    }
    assert.equal(
      fs.readFileSync(join(fixture, 'vitest.config.mjs'), 'utf8'),
      profile.after ?? profile.config
    )
    assert.equal(fs.existsSync(directory), profile.directoryExists)
    const files = []
    function collect(folder) {
      for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
        const file = join(folder, entry.name)
        if (entry.isDirectory()) collect(file)
        else files.push(relative(directory, file))
      }
    }
    if (fs.existsSync(directory)) collect(directory)
    assert.deepEqual(files.sort(), profile.files)
    assert.equal(
      fs.existsSync(join(directory, 'coverage-final.json')),
      profile.expectCoverage
    )
    if (profile.expectCoverage) {
      const model = Object.fromEntries(
        Object.entries(
          JSON.parse(fs.readFileSync(join(directory, 'coverage-final.json')))
        ).map(([file, data]) => [
          basename(file),
          { ...data, path: basename(file) },
        ])
      )
      assert.deepEqual(model, expected.coverage)
    }
    for (const name of files) {
      const bytes = fs.readFileSync(join(directory, name))
      assert(bytes.length, 'Empty report file: ' + name)
      if (name.endsWith('.html')) {
        const html = bytes.toString()
        assert.match(html, /<html[ >]/i)
        if (name === 'index.html') {
          const embedded = html.match(/window\.data = (\{[^\n]+\});/)
          assert(embedded, 'SPA report must publish its coverage data')
          const data = JSON.parse(embedded[1])
          assert.deepEqual(data.children.map((child) => child.file).sort(), [
            'fully.mjs',
            'subject.mjs',
            'unimported.mjs',
          ])
          assert.equal(data.metrics.statements.total, 9)
          assert.equal(data.metrics.statements.covered, 3)
          assert(html.includes('src="bundle.js"'))
        } else assert.match(html, /coverage/i)
      }
      if (name === 'cobertura-coverage.xml') {
        const xml = bytes.toString()
        assert.match(xml, /<coverage\b[^>]*line-rate="[\d.]+"/)
        for (const file of ['fully.mjs', 'subject.mjs', 'unimported.mjs'])
          assert(xml.includes('filename="' + file + '"'))
        assert(xml.includes('</coverage>'))
      }
      if (name.endsWith('.png'))
        assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
    }
    const marker =
        profile.reporter === 'teamcity'
          ? '##teamcity['
          : profile.reporter === 'text-lcov'
            ? 'TN:\n'
            : undefined,
      offset = marker ? owner.stdout.indexOf(marker) : -1,
      stdout = offset >= 0 ? owner.stdout.slice(offset).trim() : ''
    assert.equal(stdout, profile.stdout)
    if (profile.reporter === 'none') {
      assert(!owner.stdout.includes('##teamcity['))
      assert(!owner.stdout.includes('TN:\n'))
    }
    results.push({
      name: profile.name,
      caseOutcomesVerified: true,
      coverageCountersVerified: profile.expectCoverage,
      reportFilesVerified: true,
      reporterStdoutVerified: true,
      configEditsVerified: true,
      exitCode: owner.status,
    })
  } finally {
    if (joined) fs.rmSync(fixture, { recursive: true, force: true })
  }
}
fs.writeFileSync(
  join(output, 'RESULTS.json'),
  JSON.stringify(
    { status: 'passed', profiles: results.length, results },
    null,
    2
  ) + '\n'
)
