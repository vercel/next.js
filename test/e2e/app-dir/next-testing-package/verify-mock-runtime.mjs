import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from './process-supervisor.mjs'
import { createRequire } from 'node:module'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { stripVTControlCharacters } from 'node:util'
import {
  readResultEvents,
  assertSuccessfulRun,
} from './result-event-verifier.mjs'

// Run only with coordinator-approved real packed compiler/native artifacts.
// Install the artifacts first, then run verify-mock-authoring.mjs in this consumer.
const fixture = dirname(fileURLToPath(import.meta.url))
const repository = realpathSync(resolve(fixture, '../../../..'))
const [consumerArg, outputArg, expectedHash] = process.argv.slice(2)
assert(
  consumerArg && outputArg && /^[a-f0-9]{64}$/.test(expectedHash ?? ''),
  'Usage: node verify-mock-runtime.mjs <external-consumer> <new-evidence-dir> <native-sha256>'
)
const consumer = realpathSync(consumerArg)
assert(!consumer.startsWith(repository + '/'))
const output = resolve(outputArg)
mkdirSync(output)
const require = createRequire(join(consumer, 'package.json'))
for (const dependency of ['vitest', 'vite'])
  assert.throws(() => require.resolve(dependency))
const native = realpathSync(require.resolve('@next/swc-darwin-arm64'))
assert(native.startsWith(join(consumer, 'node_modules') + '/'))
assert.equal(
  createHash('sha256').update(readFileSync(native)).digest('hex'),
  expectedHash
)
const cli = realpathSync(require.resolve('next/dist/bin/next'))
assert(cli.startsWith(join(consumer, 'node_modules') + '/'))
for (const file of ['app', 'mock-runtime', 'next.config.js']) {
  cpSync(join(fixture, file), join(consumer, file), {
    recursive: true,
    force: false,
    errorOnExist: true,
  })
}
for (const file of ['mock-js.case.js', 'mock-ts.case.ts'])
  assert(existsSync(join(consumer, 'mock-authoring', file)))
const sentinels = [
  'unexpected-failure-body',
  'unexpected-scope-body',
  'unexpected-setup',
  'unexpected-nonliteral-body',
]
for (const file of sentinels) assert(!existsSync(join(consumer, file)))
const project = (name, include, extra = {}) => ({
  name,
  include,
  environment: 'node',
  mode: 'development',
  ...extra,
})
const config = {
  compatibility: 'vitest',
  projects: [
    project('positive', [
      'mock-authoring/mock-*.case.*',
      'mock-runtime/zz-unmocked-*.case.*',
    ]),
    project('failure', ['mock-runtime/failure.case.js']),
    project('setup-scope', ['mock-runtime/scope.case.js'], {
      setupFiles: ['mock-runtime/setup.js'],
    }),
    project('rsc-scope', ['mock-runtime/scope.case.js'], {
      environment: 'rsc',
    }),
    project('nonliteral', ['mock-runtime/nonliteral.case.js']),
    project('after-failures', ['mock-runtime/zz-unmocked-js.case.js']),
  ],
}
assert(!existsSync(join(consumer, 'next.test.config.json')))
writeFileSync(
  join(consumer, 'next.test.config.json'),
  JSON.stringify(config, null, 2)
)
const audit = join(output, 'audit-native.cjs')
writeFileSync(
  audit,
  `const fs = require('node:fs');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const original = process.dlopen;
process.dlopen = function(module, filename, ...rest) {
  if (String(filename).includes('swc') && String(filename).endsWith('.node')) {
    const actual = fs.realpathSync(filename);
    const sha256 = crypto.createHash('sha256').update(fs.readFileSync(actual)).digest('hex');
    assert.equal(actual, ${JSON.stringify(native)});
    assert.equal(sha256, ${JSON.stringify(expectedHash)});
    fs.appendFileSync(process.env.PACKED_NATIVE_AUDIT, JSON.stringify({pid:process.pid,path:actual,sha256})+'\\n');
  }
  return original.call(this, module, filename, ...rest);
};\n`
)
const env = { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }
for (const key of [
  'NODE_OPTIONS',
  'NODE_PATH',
  'NEXT_TEST_NATIVE_DIR',
  'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
])
  delete env[key]
const results = []
async function run(name, expectedStatus, pattern, passedCases = 0) {
  const auditLog = join(output, `native-${name}.jsonl`)
  const eventLog = join(output, `events-${name}.jsonl`)
  const args = [cli, 'test', '.', '--run', '--project', name]
  const result = await runOwnedNode(args, {
    cwd: consumer,
    env: {
      ...env,
      NODE_OPTIONS: `--require=${JSON.stringify(audit)} --import=${JSON.stringify(pathToFileURL(join(fixture, 'result-events.cjs')).href)}`,
      NEXT_TEST_EVENT_AUDIT: eventLog,
      PACKED_NATIVE_AUDIT: auditLog,
    },
    auditDir: join(output, `processes-${name}`),
    timeoutMs: 180000,
  })
  const log = (result.stdout ?? '') + (result.stderr ?? '')
  writeFileSync(join(output, `${name}.log`), log)
  const record = {
    name,
    args,
    status: result.status,
    expectedStatus,
    native,
    nativeSha256: expectedHash,
  }
  results.push(record)
  writeFileSync(join(output, 'commands.json'), JSON.stringify(results, null, 2))
  assertOwnedNodeCompleted(result, name)
  assert.equal(result.status, expectedStatus, `${name}: see retained log`)
  const diagnosticLog = stripVTControlCharacters(log)
  assert.doesNotMatch(
    diagnosticLog,
    /\bFATAL\b|unexpected Turbopack error|TurbopackInternalError|Expected [`'"]?telemetry[`'"]? to be set in globals|\bpanicked at\b|UnhandledPromiseRejection|uncaughtException|segmentation fault|abort trap|out of memory/i,
    `${name}: unexpected fatal or infrastructure failure in retained log`
  )
  const events = readResultEvents(eventLog)
  if (pattern.compilationMessage) {
    assert(
      events.some(
        (event) =>
          event.type === 'diagnostic' &&
          event.diagnostic.phase === 'compilation' &&
          stripVTControlCharacters(event.diagnostic.message)
            .split(/\r?\n/)
            .some(
              (line) =>
                line.replace(/^Error: /, '').trim() ===
                pattern.compilationMessage
            )
      ),
      `${name}: expected message missing from compilation diagnostic event`
    )
  } else {
    assert.match(JSON.stringify(events), pattern)
  }
  const passed = events.filter(
    (event) => event.type === 'case-end' && event.status === 'passed'
  )
  assert.equal(passed.length, passedCases, `${name}: passing case count`)
  if (passedCases) assertSuccessfulRun(events, { cases: passedCases })
  assert(existsSync(auditLog) && readFileSync(auditLog, 'utf8').trim())
  for (const file of sentinels) assert(!existsSync(join(consumer, file)), file)
  console.log(JSON.stringify(record))
}
await run('positive', 0, /unmocked TS file observes original exports/, 4)
await run('failure', 1, /P2_PUBLIC_MOCK_FACTORY_FAILURE/)
assert.match(
  readFileSync(join(output, 'failure.log'), 'utf8'),
  /failure\.case\.js:\d+/
)
await run('setup-scope', 1, {
  compilationMessage:
    'Static module mocks with setup files are not supported yet',
})
await run('rsc-scope', 1, {
  compilationMessage:
    'Static module mocks currently support Node test entries only',
})
await run('nonliteral', 1, {
  compilationMessage:
    'vi.mock target must be a string literal (nonliteral.case.js).',
})
await run('after-failures', 0, /unmocked JS file observes original exports/, 1)
writeFileSync(
  join(output, 'passed.json'),
  JSON.stringify({ consumer, native, expectedHash, results }, null, 2)
)
console.log(`Public packed mock runtime checks passed: ${output}`)
