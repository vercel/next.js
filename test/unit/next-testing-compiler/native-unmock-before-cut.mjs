import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
import { resolveFixturePath } from '../../lib/next-testing-fixtures.cjs'

const [repoArg, outputArg, mode, kind, group] = process.argv.slice(2)
const repo = fs.realpathSync(repoArg)
const output = path.resolve(outputArg)
const here = path.dirname(fileURLToPath(import.meta.url))
assert(['development', 'production'].includes(mode))
assert(['source', 'installed'].includes(kind))
assert(['before-cut-arrow', 'before-cut-function'].includes(group))
const stored = JSON.parse(
  fs.readFileSync(
    resolveFixturePath(
      path.join(here, 'native-unmock-before-cut-pristine.json')
    )
  )
)
assert.equal(stored.referenceVersion, '5.0.4')
assert(stored.groups, 'Requires the shared genuine behavior model')
const expected = stored.groups[group][mode]
const authored = stored.authoredSHA256[group]
const load = createRequire(path.join(repo, 'package.json'))
if (kind === 'installed') {
  for (const name of ['vitest', 'vite', '@vitest/mocker']) {
    assert.throws(() => load.resolve(name))
  }
}
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
fs.mkdirSync(output, { recursive: true })
const fixture = fs.mkdtempSync(path.join(repo, '.next-test-before-cut-pair-'))
let joined = false
try {
  for (const [name, hash] of Object.entries(authored)) {
    const bytes = fs.readFileSync(
      resolveFixturePath(
        path.join(
          here,
          'native-unmock-before-cut-fixtures',
          group,
          name + '.txt'
        )
      )
    )
    assert.equal(sha(bytes), hash, name)
    const target = path.join(fixture, name)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, bytes)
  }
  fs.writeFileSync(
    path.join(fixture, 'package.json'),
    '{"private":true,"type":"module"}\n'
  )
  fs.writeFileSync(
    path.join(fixture, 'next.config.mjs'),
    'export default ' +
      JSON.stringify({
        turbopack: { root: repo },
        serverExternalPackages: stored.packages[group],
      }) +
      '\n'
  )
  fs.writeFileSync(
    path.join(fixture, 'next.test.config.json'),
    JSON.stringify({
      maxWorkers: 1,
      projects: [
        {
          name: 'before-cut-native-pair',
          mode,
          environment: 'node',
          include: ['contract.test.mjs'],
          testTimeout: 10000,
          hookTimeout: 10000,
        },
      ],
    }) + '\n'
  )
  const modules = path.join(fixture, 'node_modules')
  for (const name of fs.readdirSync(path.join(repo, 'node_modules'))) {
    const target = path.join(modules, name)
    assert(
      !fs.existsSync(target),
      'Fixture package conflicts with the consumer'
    )
    if (['.vite', '.vite-temp', '.cache', '.vitest-cache'].includes(name)) {
      fs.mkdirSync(target)
    } else {
      fs.symlinkSync(path.join(repo, 'node_modules', name), target, 'dir')
    }
  }
  const trace = path.join(output, 'console.raw.jsonl')
  const reporter = path.join(fixture, 'reporter.mjs')
  fs.writeFileSync(
    reporter,
    "import fs from 'node:fs';export default class{onUserConsoleLog(log){fs.appendFileSync(process.env.MOCKPAIR_TRACE,JSON.stringify({log})+'\\n')}}\n"
  )
  const reportPath = path.join(output, 'report.json')
  const env = {
    ...process.env,
    NODE_ENV: mode,
    NEXT_TELEMETRY_DISABLED: '1',
    TURBO_TASKS_AVAILABLE_PARALLELISM: '4',
    FORCE_COLOR: '0',
    MOCKPAIR_TRACE: trace,
  }
  for (const name of [
    'CI',
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
      '--reporter=' + reporter,
      '--outputFile=' + reportPath,
    ],
    {
      cwd: fixture,
      env,
      timeoutMs: 120000,
      auditDir: path.join(output, 'owners'),
    }
  )
  fs.writeFileSync(
    path.join(output, 'OWNER.json'),
    JSON.stringify(owner, null, 2) + '\n'
  )
  fs.writeFileSync(path.join(output, 'stdout.log'), owner.stdout)
  fs.writeFileSync(path.join(output, 'stderr.log'), owner.stderr)
  assertOwnedNodeCompleted(
    owner,
    'Retained before-cut native pair complete model'
  )
  joined = true
  for (const [name, hash] of Object.entries(authored)) {
    assert.equal(sha(fs.readFileSync(path.join(fixture, name))), hash, name)
  }
  const report = JSON.parse(fs.readFileSync(reportPath))
  const logs = fs.readFileSync(trace, 'utf8').trim().split('\n').filter(Boolean)
  const observed = {
    cases: report.testResults.flatMap((file) =>
      file.assertionResults.map((test) => ({
        name: test.fullName,
        status: test.status,
        failureMessages: test.failureMessages,
      }))
    ),
    rows: logs.flatMap((line) => {
      const { log } = JSON.parse(line)
      return log.content
        .split('\n')
        .filter((entry) => entry.startsWith('MOCKPAIR:'))
        .map((entry) => ({
          type: log.type,
          value: JSON.parse(entry.slice(9)),
        }))
    }),
    fileMessages: report.testResults.map((file) => file.message),
    counts: Object.fromEntries(
      Object.entries(report).filter(([key]) => key.startsWith('num'))
    ),
    success: report.success,
    exit: owner.status,
  }
  fs.writeFileSync(
    path.join(output, 'OBSERVED.json'),
    JSON.stringify(observed, null, 2) + '\n'
  )
  assert.deepEqual(observed, expected)
  const checks = {
    mode,
    group,
    runtime: process.version,
    cases: observed.cases.length,
    rows: observed.rows.length,
    completeAuthoredCasesAndRows: true,
    completeNamespaceAndFunctionDescriptors: true,
    earlierUnmockKeepsActualStaticRegistration: true,
    nativeCycleAndPartialExports: true,
    staticRuntimeActualResetUnmockIdentities: true,
    exactOriginalAndFactoryEvaluations: true,
    completeCountsAndFileMessages: true,
    allAuthoredBytesHeld: true,
    allOwnersJoined: true,
  }
  fs.writeFileSync(
    path.join(output, 'CHECKS.json'),
    JSON.stringify(checks, null, 2) + '\n'
  )
  process.stdout.write(JSON.stringify(checks) + '\n')
} finally {
  if (joined) fs.rmSync(fixture, { recursive: true, force: true })
}
