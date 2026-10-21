import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from './process-supervisor.mjs'

const [consumerArgument, outputArgument] = process.argv.slice(2)
assert(consumerArgument && outputArgument, 'consumer and output required')
const consumer = resolve(consumerArgument)
const output = resolve(outputArgument)
const require = createRequire(join(consumer, 'package.json'))
for (const name of ['vitest', 'vite'])
  assert.throws(() => require.resolve(name))
mkdirSync(output)
const directory = dirname(fileURLToPath(import.meta.url))
const source = join(directory, 'fixtures/route-stream')
const base = join(directory, 'fixtures/late-streamed-redirect')
const hash = (file) =>
  createHash('sha256').update(readFileSync(file)).digest('hex')
const save = (dir, name, value) =>
  writeFileSync(join(dir, name), JSON.stringify(value, null, 2) + '\n')
const verification = []
for (const mode of ['development', 'production']) {
  for (const kind of ['redirect', 'ownership']) {
    const out = join(output, mode, kind)
    mkdirSync(out, { recursive: true })
    const fixture = join(consumer, '.next-test-route-stream-' + randomUUID())
    mkdirSync(fixture)
    const staged = {}
    const sources = {}
    function copy(from, target) {
      sources[from] = hash(from)
      staged[target] = sources[from]
      mkdirSync(dirname(join(fixture, target)), { recursive: true })
      copyFileSync(from, join(fixture, target))
    }
    function stage(path, prefix = '') {
      for (const entry of readdirSync(path, { withFileTypes: true })) {
        const name = prefix + entry.name
        if (entry.isDirectory()) stage(join(path, entry.name), name + '/')
        else if (entry.isFile())
          copy(
            join(path, entry.name),
            name.endsWith('.txt') ? name.slice(0, -4) : name
          )
      }
    }
    stage(base)
    const file =
      kind === 'redirect' ? 'live-late-redirect.case.jsx' : 'owner.case.jsx'
    copy(join(source, file + '.txt'), file)
    if (kind === 'ownership') {
      stage(join(source, 'owner-route'))
      copy(join(source, 'owner-row.mjs.txt'), 'owner-row.mjs')
    }
    const expectedPath = join(source, kind + '-' + mode + '.expected.json')
    copy(expectedPath, 'expected.json')
    const expected = JSON.parse(readFileSync(expectedPath, 'utf8'))
    writeFileSync(
      join(fixture, 'package.json'),
      '{"private":true,"type":"module"}\n'
    )
    writeFileSync(
      join(fixture, 'next.test.config.json'),
      JSON.stringify({
        maxWorkers: 1,
        projects: [
          {
            name: 'route-stream-' + kind,
            environment: 'rsc',
            mode,
            route:
              kind === 'redirect'
                ? '/[tenant]/late-redirect/[...slug]'
                : '/[tenant]/stream-owner/[...slug]',
            include: [file],
            fileTimeout: 60000,
          },
        ],
      }) + '\n'
    )
    const env = {
      ...process.env,
      NODE_ENV: mode,
      NEXT_TELEMETRY_DISABLED: '1',
      FORCE_COLOR: '0',
    }
    for (const key of [
      'CI',
      'NODE_PATH',
      'NODE_OPTIONS',
      'NEXT_TEST_NATIVE_DIR',
      'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
    ])
      delete env[key]
    const args = [
      require.resolve('next/dist/bin/next'),
      'test',
      fixture,
      '--run',
      '--reporter=json',
      '--outputFile',
      join(out, 'report.json'),
    ]
    save(out, 'command.json', {
      args,
      fixture,
      mode,
      kind,
      runtime: process.version,
      sources,
      comparison:
        'Real AppPage streaming fallback and complete ownership rows against ordinary application responses; real after failures stay failed',
    })
    try {
      const result = await runOwnedNode(args, {
        cwd: fixture,
        env,
        auditDir: join(out, 'processes'),
        timeoutMs: 120000,
      })
      writeFileSync(join(out, 'stdout.log'), result.stdout)
      writeFileSync(join(out, 'stderr.log'), result.stderr)
      assertOwnedNodeCompleted(result, 'route streaming ' + mode + ' ' + kind)
      const report = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8'))
      const cases = report.testResults.flatMap((file) =>
        file.assertionResults.map(({ fullName, status, failureMessages }) => ({
          fullName,
          status,
          failureMessages,
        }))
      )
      const prefix =
        kind === 'redirect' ? 'LIVE_LATE_REDIRECT ' : 'LIVE_STREAM_OWNER '
      const rows = report.next.events
        .filter((event) => event.type === 'output')
        .flatMap((event) => event.text.split('\n'))
        .filter((line) => line.startsWith(prefix))
        .map((line) => JSON.parse(line.slice(prefix.length)))
      save(out, 'cases.json', cases)
      save(out, 'rows.json', rows)
      assert.equal(cases.length, kind === 'redirect' ? 6 : 8)
      assert.equal(
        cases.filter(
          (test) =>
            test.status === 'passed' && test.failureMessages.length === 0
        ).length,
        6
      )
      if (kind === 'ownership') {
        assert.equal(result.status, 1)
        const failed = cases.filter((test) => test.status === 'failed')
        assert.equal(failed.length, 2)
        for (const test of failed) {
          assert(test.fullName.includes('after rejected'))
          assert(test.failureMessages.length > 0)
          assert(
            test.failureMessages.every((message) =>
              message.includes('Owned real AppPage after failure')
            )
          )
        }
      } else assert.equal(result.status, 0)
      assert.deepEqual(rows, expected)
      verification.push({
        mode,
        kind,
        cases: cases.length,
        fullRows: rows.length,
        passed: 6,
        retainedRealAfterFailures: kind === 'ownership' ? 2 : 0,
      })
    } finally {
      for (const [file, digest] of Object.entries(staged))
        assert.equal(
          hash(join(fixture, file)),
          digest,
          'Authored source changed: ' + file
        )
      for (const [file, digest] of Object.entries(sources))
        assert.equal(hash(file), digest, 'Maintained source changed: ' + file)
      save(out, 'source-hold.json', {
        maintainedSources: Object.keys(sources).length,
        stagedInputs: Object.keys(staged).length,
        allInputHashesHeld: true,
      })
      rmSync(fixture, { recursive: true, force: true })
      save(out, 'closed.json', {
        fixtureRemoved: true,
        ownedProcessesClosed: true,
      })
    }
  }
}
save(output, 'verified.json', verification)
console.log(
  'Installed route streaming:28 complete reference rows, real fallback/cancellation/after ownership,4 visible cleanup failures and owned cleanup verified'
)
