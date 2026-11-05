import { resolveFixturePath } from '../../lib/next-testing-fixtures.cjs'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'

const [consumerArgument, outputArgument, mode, variant] = process.argv.slice(2)
assert(consumerArgument && outputArgument)
assert(['development', 'production'].includes(mode))
assert(['default', 'initial', 'codeGeneration', 'unknown'].includes(variant))
const consumer = resolve(consumerArgument)
const output = resolve(outputArgument)
const directory = dirname(fileURLToPath(import.meta.url))
const fixtureDirectory = join(directory, 'fixtures/edge-options')
const major = process.versions.node.split('.')[0]
const expected = JSON.parse(
  readFileSync(
    resolveFixturePath(
      join(fixtureDirectory, `node${major}.${mode}.expected.json`)
    )
  )
)
assert(!existsSync(output))
mkdirSync(output, { recursive: true })
const load = createRequire(join(consumer, 'package.json'))
const fixture = mkdtempSync(join(consumer, '.next-test-edge-options-'))
const hash = (file) =>
  createHash('sha256').update(readFileSync(file)).digest('hex')
const source = join(fixtureDirectory, 'edge.case.mjs.txt')
const authoredSHA256 = hash(resolveFixturePath(source))
copyFileSync(resolveFixturePath(source), join(fixture, 'edge.test.mjs'))
writeFileSync(
  join(fixture, 'package.json'),
  '{"private":true,"type":"module"}\n'
)
writeFileSync(
  join(fixture, 'next.config.mjs'),
  'export default ' + JSON.stringify({ turbopack: { root: consumer } }) + '\n'
)
const options = {
  default: {},
  initial: {
    'edge-runtime': { initialCode: 'globalThis.__edgeOptionSentinel=91' },
  },
  codeGeneration: {
    'edge-runtime': { codeGeneration: { strings: true, wasm: false } },
  },
  unknown: { ignored: { enabled: true } },
}[variant]
const config = {
  test: {
    mode,
    include: ['edge.test.mjs'],
    environment: 'edge-runtime',
    environmentOptions: options,
    testTimeout: 10000,
    hookTimeout: 10000,
  },
}
writeFileSync(
  join(fixture, 'next.test.config.json'),
  JSON.stringify(config) + '\n'
)
const save = (name, value) =>
  writeFileSync(join(output, name), JSON.stringify(value, null, 2) + '\n')
writeFileSync(join(output, 'console.raw.jsonl'), '')
writeFileSync(
  join(fixture, 'reporter.mjs'),
  `import fs from'node:fs';export default class{onUserConsoleLog(log){fs.appendFileSync(${JSON.stringify(join(output, 'console.raw.jsonl'))},JSON.stringify(log)+'\\n')}onTestRunEnd(modules,errors,reason){fs.writeFileSync(${JSON.stringify(join(output, 'ended.json'))},JSON.stringify({reason,errors:errors.map(e=>({name:e.name,message:e.message,stack:e.stack})),modules:modules.map(m=>({state:m.state(),errors:m.errors().map(e=>({name:e.name,message:e.message,stack:e.stack}))}))},null,2))}}\n`
)
const env = Object.fromEntries(
  ['HOME', 'PATH', 'TMPDIR', 'LANG', 'SHELL']
    .filter((key) => process.env[key] !== undefined)
    .map((key) => [key, process.env[key]])
)
Object.assign(env, {
  NODE_ENV: mode,
  CI: '1',
  NEXT_TELEMETRY_DISABLED: '1',
  GIT_OPTIONAL_LOCKS: '0',
  FORCE_COLOR: '0',
})
const args = [
  load.resolve('next/dist/bin/next'),
  'test',
  fixture,
  '--run',
  '--reporter=json',
  '--reporter=' + join(fixture, 'reporter.mjs'),
  '--outputFile',
  join(output, 'report.raw.json'),
]
save('REQUEST.json', {
  consumer,
  args,
  config,
  node: { version: process.version, execPath: process.execPath },
  authoredSHA256,
  fixture,
  optionsIntentionallyIgnoredNotForwardedToVM: true,
})
let joined = false
try {
  const result = await runOwnedNode(args, {
    cwd: fixture,
    env,
    auditDir: join(output, 'owners'),
    timeoutMs: 120000,
  })
  save('OWNER.json', result)
  writeFileSync(join(output, 'stdout.log'), result.stdout)
  writeFileSync(join(output, 'stderr.log'), result.stderr)
  assertOwnedNodeCompleted(result, 'public Edge environment option contract')
  joined = true
  const report = JSON.parse(readFileSync(join(output, 'report.raw.json')))
  const rows = readFileSync(join(output, 'console.raw.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((log) => log.content.startsWith('EDGE_OPTION_ROW '))
    .map((log) => ({
      type: log.type,
      value: JSON.parse(log.content.slice('EDGE_OPTION_ROW '.length)),
    }))
  const actual = {
    status: result.status,
    counts: Object.fromEntries(
      [
        'numTotalTests',
        'numPassedTests',
        'numFailedTests',
        'numPendingTests',
        'numTotalTestSuites',
        'numPassedTestSuites',
        'numFailedTestSuites',
        'success',
      ].map((key) => [key, report[key]])
    ),
    cases: report.testResults
      .flatMap((file) => file.assertionResults)
      .map(({ duration, ...fields }) => fields),
    rows,
    terminal: JSON.parse(readFileSync(join(output, 'ended.json'))),
  }
  save('OBSERVED.json', actual)
  assert.deepEqual(actual, expected)
  assert.equal(hash(join(fixture, 'edge.test.mjs')), authoredSHA256)
  console.log(
    JSON.stringify({
      mode,
      variant,
      cases: 1,
      rows: 1,
      completeGenuineModel: true,
      ignoredOptionsNotAppliedToVM: true,
    })
  )
} finally {
  assert.equal(hash(resolveFixturePath(source)), authoredSHA256)
  if (joined) rmSync(fixture, { recursive: true, force: true })
  save('CLOSED.json', {
    joined,
    fixtureRemoved: !existsSync(fixture),
    authoredBytesHeld: true,
  })
}
