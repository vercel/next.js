import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../../e2e/app-dir/next-testing-package/process-supervisor.mjs'

const [
  consumerArg,
  outputArg,
  dependenciesArg = consumerArg,
  selection = 'extensions,effects',
] = process.argv.slice(2)
assert(consumerArg && outputArg)
assert(['extensions,effects', 'module'].includes(selection))
const consumer = fs.realpathSync(consumerArg)
const directory = path.dirname(fileURLToPath(import.meta.url))
const output = path.resolve(outputArg)
const require = createRequire(path.join(consumer, 'package.json'))
const dependency = createRequire(
  path.join(path.resolve(dependenciesArg), 'package.json')
)
const next = require.resolve('next/dist/bin/next')
const modules = Object.fromEntries(
  ['react', 'react-dom', 'playwright'].map((name) => [
    name,
    path.dirname(dependency.resolve(name + '/package.json')),
  ])
)
let compilerRoot = consumer
for (const moduleDir of Object.values(modules))
  while (path.relative(compilerRoot, moduleDir).startsWith('..' + path.sep))
    compilerRoot = path.dirname(compilerRoot)
fs.mkdirSync(output, { recursive: true })
const save = (where, name, value) =>
  fs.writeFileSync(
    path.join(where, name),
    JSON.stringify(value, null, 2) + '\n'
  )
const env = { ...process.env, FORCE_COLOR: '0', NEXT_TELEMETRY_DISABLED: '1' }
for (const key of [
  'CI',
  'NODE_OPTIONS',
  'NODE_PATH',
  'NEXT_TEST_NATIVE_DIR',
  'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
])
  delete env[key]
const caseCounts = { extensions: 4, effects: 2, module: 2 }
const profiles = []
for (const kind of selection.split(',')) {
  for (const mode of ['development', 'production']) {
    const evidence = path.join(output, kind + '-' + mode)
    fs.mkdirSync(evidence)
    const fixture = fs.mkdtempSync(
      path.join(consumer, '.next-test-locator-extensions-')
    )
    let joined = false
    try {
      fs.copyFileSync(
        path.join(directory, kind + '.test.mjs.txt'),
        path.join(fixture, 'fixtures.test.mjs')
      )
      fs.writeFileSync(
        path.join(fixture, 'package.json'),
        '{"private":true,"type":"module"}\n'
      )
      fs.mkdirSync(path.join(fixture, 'node_modules'))
      for (const name of fs.readdirSync(path.join(consumer, 'node_modules'))) {
        if (name in modules) continue
        const source = path.join(consumer, 'node_modules', name)
        fs.symlinkSync(
          source,
          path.join(fixture, 'node_modules', name),
          fs.statSync(source).isDirectory() ? 'dir' : 'file'
        )
      }
      for (const [name, source] of Object.entries(modules))
        fs.symlinkSync(source, path.join(fixture, 'node_modules', name), 'dir')
      fs.writeFileSync(
        path.join(fixture, 'next.config.mjs'),
        'export default ' +
          JSON.stringify({ turbopack: { root: compilerRoot } }) +
          '\n'
      )
      fs.writeFileSync(
        path.join(fixture, 'next.test.config.json'),
        JSON.stringify({
          test: {
            include: ['fixtures.test.mjs'],
            maxWorkers: 1,
            environment: 'browser',
            mode,
            browser: {
              enabled: true,
              headless: true,
              instances: [{ browser: 'chromium' }],
            },
            testTimeout: 5000,
            hookTimeout: 5000,
            includeTaskLocation: false,
          },
        }) + '\n'
      )
      const reportFile = path.join(evidence, 'report.json')
      const owner = await runOwnedNode(
        [
          next,
          'test',
          fixture,
          '--run',
          '--reporter=json',
          '--outputFile=' + reportFile,
        ],
        {
          cwd: fixture,
          env: { ...env, NODE_ENV: mode },
          auditDir: path.join(evidence, 'owners'),
          timeoutMs: 120000,
        }
      )
      save(evidence, 'owner.json', owner)
      fs.writeFileSync(path.join(evidence, 'stdout.log'), owner.stdout)
      fs.writeFileSync(path.join(evidence, 'stderr.log'), owner.stderr)
      assertOwnedNodeCompleted(
        owner,
        'Browser locator extensions ' + kind + ' ' + mode
      )
      joined = true
      assert.equal(owner.status, 0, owner.stderr)
      const report = JSON.parse(fs.readFileSync(reportFile))
      const cases = report.testResults.flatMap((file) => file.assertionResults)
      assert.equal(cases.length, caseCounts[kind])
      assert.equal(report.numPassedTests, caseCounts[kind])
      assert.equal(report.numFailedTests, 0)
      assert.equal(report.success, true)
      for (const testcase of cases) {
        assert.equal(testcase.status, 'passed', testcase.fullName)
        assert.deepEqual(testcase.failureMessages, [])
      }
      profiles.push({
        kind,
        mode,
        cases: cases.length,
        locatorRegressionAssertionsPassed: true,
        allOwnersJoined: true,
      })
    } finally {
      if (joined) fs.rmSync(fixture, { recursive: true, force: true })
    }
  }
}
save(output, 'VERIFIED.json', {
  profiles: profiles.length,
  cases: profiles.reduce((sum, item) => sum + item.cases, 0),
  locatorRegressionAssertionsPassed: true,
  actualRegistrationAndCallbackEffectsMatch: true,
  allOwnersJoined: true,
  allFixturesRemoved: true,
  runs: profiles,
})
