import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repositoryFixtures = path.resolve(here, '../../..')
const corpus = path.join(here, 'fixtures/native-multi-target')
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const stored = JSON.parse(fs.readFileSync(path.join(corpus, 'corpus.json')))
assert.equal(stored.referenceVersion, '5.0.4')

export function readNativeMultiTargetCase(
  mode,
  group,
  engine = process.versions.node.split('.')[0]
) {
  assert(['development', 'production'].includes(mode))
  const definition = stored.groups[group]
  assert(definition, 'Unknown native multi-target fixture')
  const reference = stored.engines[engine]
  assert(
    reference,
    'Native multi-target corpus requires a measured Node version'
  )
  const model = reference.profiles[group]?.[mode]
  assert(model)
  const raw = fs.readFileSync(path.join(corpus, model.stored))
  assert.equal(sha(raw), model.sha256, 'Changed complete genuine model')
  const expected = JSON.parse(raw)
  const body = fs.readFileSync(path.join(repositoryFixtures, definition.body))
  assert.equal(
    sha(body),
    definition.bodySHA256,
    'Changed shared Rust/public body'
  )
  const files = [
    { target: 'contract.test.mjs', bytes: body, sha256: definition.bodySHA256 },
    ...Object.entries(stored.commonFiles).map(([target, file]) => {
      const bytes = fs.readFileSync(path.join(corpus, file.stored))
      assert.equal(sha(bytes), file.sha256, target)
      return { target, bytes, sha256: file.sha256 }
    }),
  ]
  return { expected, files, packages: definition.packages, reference, engine }
}

/** Preserve the complete existing344 comparison, without additional normalization. */
export function nativeMultiTargetModel(report, consoleText, end, exit) {
  return {
    cases: report.testResults.flatMap((file) =>
      file.assertionResults.map((test) => ({
        name: test.fullName,
        status: test.status,
        failureMessages: test.failureMessages,
      }))
    ),
    rows: consoleText
      .split('\n')
      .filter(Boolean)
      .flatMap((line) => {
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
    exit,
    terminal: end,
  }
}

export function verifyNativeMultiTargetCorpus() {
  let models = 0
  for (const engine of Object.keys(stored.engines))
    for (const group of Object.keys(stored.groups))
      for (const mode of ['development', 'production']) {
        const { expected } = readNativeMultiTargetCase(mode, group, engine)
        assert.equal(expected.exit, 0)
        assert.equal(expected.success, true)
        assert.equal(expected.cases.length, 1)
        assert.equal(expected.rows.length, 1)
        models++
      }
  return {
    referenceVersion: '5.0.4',
    models,
    bodies: Object.keys(stored.groups).length,
    commonFiles: Object.keys(stored.commonFiles).length,
    engines: Object.keys(stored.engines),
    rawModelsByteExact: true,
    sharedBodiesByteExact: true,
  }
}

async function runCase([repoArg, outputArg, mode, kind, group]) {
  assert(['source', 'installed'].includes(kind))
  const repo = fs.realpathSync(repoArg),
    output = path.resolve(outputArg)
  const { expected, files, packages, engine } = readNativeMultiTargetCase(
    mode,
    group
  )
  const load = createRequire(path.join(repo, 'package.json'))
  if (kind === 'installed')
    for (const name of ['vitest', 'vite', '@vitest/mocker'])
      assert.throws(() => load.resolve(name))
  assert(!fs.existsSync(output), 'Use a new output directory')
  fs.mkdirSync(output, { recursive: true })
  const save = (name, value) =>
    fs.writeFileSync(
      path.join(output, name + '.json'),
      JSON.stringify(value, null, 2) + '\n'
    )
  const fixture = fs.mkdtempSync(
    path.join(repo, '.next-test-multi-target-cuts-')
  )
  let joined = false
  try {
    for (const { target, bytes } of files) {
      const destination = path.join(fixture, target)
      fs.mkdirSync(path.dirname(destination), { recursive: true })
      fs.writeFileSync(destination, bytes)
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
          serverExternalPackages: packages,
        }) +
        '\n'
    )
    fs.writeFileSync(
      path.join(fixture, 'next.test.config.json'),
      JSON.stringify({
        maxWorkers: 1,
        projects: [
          {
            name: 'two-native-cut-targets',
            mode,
            environment: 'node',
            include: ['contract.test.mjs'],
            testTimeout: 10000,
            hookTimeout: 10000,
          },
        ],
      }) + '\n'
    )
    for (const name of fs.readdirSync(path.join(repo, 'node_modules'))) {
      const destination = path.join(fixture, 'node_modules', name)
      assert(
        !fs.existsSync(destination),
        'Consumer package conflicts with new authored native target'
      )
      if (['.vite', '.vite-temp', '.cache', '.vitest-cache'].includes(name))
        fs.mkdirSync(destination)
      else
        fs.symlinkSync(
          path.join(repo, 'node_modules', name),
          destination,
          'dir'
        )
    }
    fs.writeFileSync(
      path.join(fixture, 'reporter.mjs'),
      "import fs from 'node:fs';export default class{onUserConsoleLog(log){fs.appendFileSync(process.env.MOCKPAIR_TRACE,JSON.stringify({log})+'\\n')}onTestRunEnd(modules,errors,reason){fs.writeFileSync(process.env.MOCKPAIR_TRACE+'.end.json',JSON.stringify({reason,errors:errors.map(e=>({name:e.name,message:e.message,stack:e.stack})),modules:modules.map(m=>({state:m.state(),errors:m.errors().map(e=>({name:e.name,message:e.message,stack:e.stack}))}))},null,2))}}\n"
    )
    const reportFile = path.join(output, 'report.raw.json'),
      trace = path.join(output, 'console.raw.jsonl')
    fs.writeFileSync(trace, '')
    const args = [
      load.resolve('next/dist/bin/next'),
      'test',
      fixture,
      '--run',
      '--reporter=json',
      '--reporter=' + path.join(fixture, 'reporter.mjs'),
      '--outputFile=' + reportFile,
    ]
    const env = {
      ...process.env,
      NODE_ENV: mode,
      NEXT_TELEMETRY_DISABLED: '1',
      FORCE_COLOR: '0',
      TURBO_TASKS_AVAILABLE_PARALLELISM: '4',
      MOCKPAIR_TRACE: trace,
    }
    for (const key of [
      'CI',
      'NODE_OPTIONS',
      'NODE_PATH',
      'NEXT_TEST_NATIVE_DIR',
      'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
    ])
      delete env[key]
    save('INPUTS', {
      kind,
      mode,
      group,
      engine,
      actualNodeVersion: process.version,
      args,
      fixture,
      sourcePins: Object.fromEntries(
        files.map(({ target, sha256 }) => [target, sha256])
      ),
      noAuthoredBodyOrExpectationRewrite: true,
    })
    const owner = await runOwnedNode(args, {
      cwd: fixture,
      env,
      auditDir: path.join(output, 'owners'),
      timeoutMs: 120000,
    })
    save('OWNER', owner)
    fs.writeFileSync(path.join(output, 'stdout.log'), owner.stdout)
    fs.writeFileSync(path.join(output, 'stderr.log'), owner.stderr)
    assertOwnedNodeCompleted(
      owner,
      'Actual two independent native-cut targets ' + group + ' ' + mode
    )
    joined = true
    for (const { target, sha256 } of files)
      assert.equal(sha(fs.readFileSync(path.join(fixture, target))), sha256)
    assert.equal(owner.status, expected.exit, owner.stdout + owner.stderr)
    const report = JSON.parse(fs.readFileSync(reportFile)),
      end = JSON.parse(fs.readFileSync(trace + '.end.json'))
    const actual = nativeMultiTargetModel(
      report,
      fs.readFileSync(trace, 'utf8'),
      end,
      owner.status
    )
    save('MODEL', actual)
    assert.deepEqual(
      actual,
      expected,
      'Whole same-engine/mode genuine descriptor, identity, factory, cyclic cache and report model'
    )
    save('RESULT', {
      kind,
      mode,
      group,
      engine,
      actualNodeVersion: process.version,
      completeModelEqual: true,
      cases: actual.cases.length,
      wholeRows: actual.rows.length,
      allAuthoredBytesHeld: true,
      allOwnersJoined: true,
    })
  } finally {
    if (joined) fs.rmSync(fixture, { recursive: true, force: true })
    save('CLOSED', {
      originalOwnerJoined: joined,
      fixtureRemoved: !fs.existsSync(fixture),
      noSourceOrSDKMutations: true,
    })
  }
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  if (process.argv[2] === '--check-corpus')
    console.log(JSON.stringify(verifyNativeMultiTargetCorpus()))
  else await runCase(process.argv.slice(2))
}
