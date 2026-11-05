import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { runCompilerCase } from '../../../lib/next-testing-case-runner.mjs'
import { resolveFixturePath } from '../../../lib/next-testing-fixtures.cjs'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from './process-supervisor.mjs'
import {
  hookProfiles,
  assertHookRows,
} from './browser-hook-order/assertions.mjs'

const [consumerArg, outputArg, enginesArg = 'chromium,firefox'] =
  process.argv.slice(2)
assert(consumerArg && outputArg, 'Expected consumer and output directory')
const consumer = fs.realpathSync(consumerArg)
const output = path.resolve(outputArg)
const corpus = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'browser-hook-order'
)
const engines = enginesArg.split(',')
assert(
  engines.length &&
    engines.every((engine) => ['chromium', 'firefox'].includes(engine)) &&
    new Set(engines).size === engines.length
)
const load = createRequire(path.join(consumer, 'package.json'))
const nextRoot = path.dirname(load.resolve('next/package.json'))
const facts = []
const save = (directory, name, value) =>
  fs.writeFileSync(
    path.join(directory, name),
    JSON.stringify(value, null, 2) + '\n'
  )
const configFor = (profile) => ({
  maxWorkers: 1,
  projects: [
    {
      name: 'browser-hook-order',
      environment: 'browser',
      mode: profile.mode,
      browser: {
        enabled: true,
        headless: true,
        instances: [{ browser: profile.browser }],
      },
      include: ['hooks.test.mjs'],
      testTimeout: 1000,
      hookTimeout: 1000,
      includeTaskLocation: false,
      sequence: { hooks: profile.order },
      ...(profile.limit === null ? {} : { maxConcurrency: profile.limit }),
    },
  ],
})
fs.mkdirSync(output)
for (const profile of hookProfiles(engines)) {
  const destination = path.join(output, profile.label)
  const source = fs.readFileSync(
    resolveFixturePath(
      path.join(corpus, 'sources', profile.source + '.test.mjs.txt')
    )
  )
  const config = configFor(profile)
  if (profile.suite === 'ordering') {
    const failed = profile.kind !== 'async-suite-ordering'
    await runCompilerCase({
      repo: consumer,
      output: destination,
      mode: profile.mode,
      files: [{ target: 'hooks.test.mjs', bytes: source }],
      config,
      expectedCount: 1,
      expectedExit: failed ? 1 : 0,
      checkOutcomes(report) {
        assert.deepEqual(
          report.testResults.map((file) => path.basename(file.name)),
          ['hooks.test.mjs']
        )
        assert.equal(report.testResults[0].status, failed ? 'failed' : 'passed')
        assert.equal(report.testResults[0].message, '')
        const cases = report.testResults.flatMap(
          (file) => file.assertionResults
        )
        assert.equal(report.success, !failed)
        assert.equal(report.next.summary.errors, Number(failed))
        assert.deepEqual(
          report.next.events.filter(
            (event) =>
              event.type === 'diagnostic' &&
              event.diagnostic.severity === 'error'
          ),
          []
        )
        assert.equal(cases[0].status, failed ? 'failed' : 'passed')
        assert.deepEqual(
          cases[0].failureMessages,
          failed
            ? [
                profile.kind === 'async-ordering'
                  ? 'actual hook sequence controlled body failure'
                  : 'actual controlled body failure',
              ]
            : []
        )
        const rows = report.next.events
          .filter((event) => event.type === 'output')
          .flatMap((event) =>
            event.text
              .split('\n')
              .filter((line) => line.startsWith(profile.prefix))
              .map((line) => JSON.parse(line.slice(profile.prefix.length)))
          )
        assertHookRows(profile, rows)
      },
    })
  } else {
    const fixture = fs.mkdtempSync(
      path.join(consumer, '.next-test-hook-resource-')
    )
    let joined = false
    let started = false
    try {
      fs.mkdirSync(destination)
      fs.writeFileSync(path.join(fixture, 'hooks.test.mjs'), source)
      fs.writeFileSync(
        path.join(fixture, 'package.json'),
        '{"type":"module","private":true}\n'
      )
      fs.symlinkSync(
        path.join(consumer, 'node_modules'),
        path.join(fixture, 'node_modules'),
        'dir'
      )
      fs.writeFileSync(
        path.join(fixture, 'next.config.mjs'),
        'export default ' +
          JSON.stringify({ turbopack: { root: consumer } }) +
          '\n'
      )
      fs.writeFileSync(
        path.join(fixture, 'next.test.config.json'),
        JSON.stringify(config) + '\n'
      )
      const env = {
        ...process.env,
        NODE_ENV: profile.mode,
        NEXT_TELEMETRY_DISABLED: '1',
        FORCE_COLOR: '0',
      }
      for (const key of [
        'CI',
        'NODE_OPTIONS',
        'NODE_PATH',
        'NEXT_TEST_NATIVE_DIR',
        'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
      ])
        delete env[key]
      started = true
      const owner = await runOwnedNode(
        [
          path.join(corpus, 'resource-worker.mjs'),
          nextRoot,
          fixture,
          destination,
          profile.browser,
          profile.mode,
          profile.kind,
          profile.order,
          String(profile.limit),
        ],
        {
          cwd: fixture,
          env,
          auditDir: path.join(destination, 'owners'),
          timeoutMs: 120000,
        }
      )
      fs.writeFileSync(path.join(destination, 'stdout.log'), owner.stdout)
      fs.writeFileSync(path.join(destination, 'stderr.log'), owner.stderr)
      assertOwnedNodeCompleted(owner, profile.label)
      joined = true
      assert.equal(owner.status, 0, owner.stdout + owner.stderr)
      assert.equal(
        JSON.parse(fs.readFileSync(path.join(destination, 'actual.json')))
          .behaviorAssertions,
        true
      )
    } finally {
      if (!started || joined)
        fs.rmSync(fixture, { recursive: true, force: true })
    }
  }
  facts.push({
    browser: profile.browser,
    mode: profile.mode,
    kind: profile.kind,
    order: profile.order,
    limit: profile.limit,
    behaviorAssertions: true,
  })
  save(output, 'checks.json', { facts })
}
save(output, 'verified.json', {
  profiles: facts.length,
  orderingProfiles: facts.filter(
    (fact) => !['user-cancel', 'hook-deadline'].includes(fact.kind)
  ).length,
  resourceProfiles: facts.filter((fact) =>
    ['user-cancel', 'hook-deadline'].includes(fact.kind)
  ).length,
  behaviorAssertions: true,
  allOwnersClosed: true,
  allInputsRemovedAfterOwnedReadersJoined: true,
})
