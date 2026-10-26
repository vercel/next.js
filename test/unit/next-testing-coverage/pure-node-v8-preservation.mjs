import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { createHash, randomUUID } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { serialize } from 'node:v8'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'

const [consumerArg, outputArg] = process.argv.slice(2)
assert(consumerArg && outputArg)
const consumer = path.resolve(consumerArg)
const output = path.resolve(outputArg)
const source = process.argv.includes('--source')
const child = process.argv.includes('--private-child')
const here = path.dirname(fileURLToPath(import.meta.url))
const load = createRequire(path.join(consumer, 'package.json'))
const nextRoot = path.dirname(load.resolve('next/package.json'))
const base = path.join(nextRoot, 'dist/experimental/testing')
const pristine = JSON.parse(
  fs.readFileSync(
    path.join(here, 'fixtures/pure-node-v8-preservation/pristine.json')
  )
)
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
assert.equal(sha(pristine.entry), pristine.entrySHA256)
assert.equal(sha(pristine.subject), pristine.subjectSHA256)
assert.equal(pristine.subject, 'export const marker = 1\n')
if (!source)
  for (const name of ['vitest', 'vite', '@vitest/mocker'])
    assert.throws(() => load.resolve(name))
const canonical = (map) =>
  Object.fromEntries(
    Object.entries(map).map(([file, value]) => [
      file === 'total' ? file : path.basename(file),
      {
        ...value,
        ...('path' in value ? { path: path.basename(value.path) } : {}),
      },
    ])
  )
const completeMessage = (message) => message.split(/\n(?: {4}at | ❯ )/u)[0]
function caseProjection(report) {
  return {
    ...Object.fromEntries(
      [
        'numTotalTestSuites',
        'numPassedTestSuites',
        'numFailedTestSuites',
        'numPendingTestSuites',
        'numTotalTests',
        'numPassedTests',
        'numFailedTests',
        'numPendingTests',
        'numTodoTests',
        'success',
      ].map((key) => [key, report[key]])
    ),
    files: report.testResults.map((file) => ({
      file: path.basename(file.name),
      status: file.status,
      message: file.message,
      cases: file.assertionResults.map((test) =>
        Object.fromEntries(
          [
            'ancestorTitles',
            'fullName',
            'status',
            'title',
            'failureMessages',
            'meta',
            'tags',
            'benchmarks',
          ]
            .filter((key) => key in test)
            .map((key) => [
              key,
              key === 'failureMessages'
                ? test[key].map(completeMessage)
                : test[key],
            ])
        )
      ),
    })),
  }
}
function environment() {
  const env = {
    ...process.env,
    CI: '1',
    NODE_ENV: 'development',
    NEXT_TELEMETRY_DISABLED: '1',
    TURBO_TASKS_AVAILABLE_PARALLELISM: '4',
    FORCE_COLOR: '0',
  }
  for (const key of [
    'NODE_OPTIONS',
    'NODE_PATH',
    'NEXT_TEST_NATIVE_DIR',
    'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
  ])
    delete env[key]
  return env
}
function assertAuthored(fixture) {
  assert.equal(
    fs.readFileSync(path.join(fixture, 'body.test.mjs'), 'utf8'),
    pristine.entry
  )
  assert.equal(
    fs.readFileSync(path.join(fixture, 'subject.mjs'), 'utf8'),
    pristine.subject
  )
  assert.equal(
    fs.readFileSync(path.join(fixture, 'vitest.config.mjs'), 'utf8'),
    pristine.config
  )
}

if (child) {
  const fixture = process.argv
    .find((arg) => arg.startsWith('--fixture='))
    .slice('--fixture='.length)
  const profile = {
    id: 'pure-module-proof',
    mode: 'development',
    environment: 'node',
    runtime: 'nodejs',
    bundler: 'turbopack',
  }
  const entry = {
    id: 'body.test.mjs',
    file: path.join(fixture, 'body.test.mjs'),
    profile,
  }
  const subject = fs.realpathSync(path.join(fixture, 'subject.mjs'))
  const identity = pathToFileURL(subject).href
  const signal = new AbortController().signal
  let session
  try {
    process.chdir(fixture)
    assertAuthored(fixture)
    session = await load(path.join(base, 'compiler')).createTestCompilerSession(
      fixture,
      profile
    )
    const artifact = await session.compile(entry, {
      signal,
      setupFiles: [],
      coverage: { version: 1, kind: 'node-line' },
    })
    fs.writeFileSync(
      path.join(output, 'ARTIFACT.json'),
      JSON.stringify(artifact, null, 2) + '\n'
    )
    assert.equal(artifact.kind, 'node')
    assert.equal(artifact.profile.mode, 'development')
    assert(!artifact.diagnostics.some((value) => value.severity === 'error'))
    assert.equal(Object.hasOwn(artifact, 'nativeTsConfigInputs'), false)
    assert.equal(Object.hasOwn(artifact.coverage, 'sourcePreservation'), false)
    assert.deepEqual(artifact.coverage.sources[identity], {
      file: subject,
      sha256: pristine.subjectSHA256,
    })
    const owners = []
    for (const script of artifact.coverage.scripts) {
      if (!script.mapPath) continue
      const code = fs.readFileSync(path.join(artifact.rootDir, script.path))
      const mapBytes = fs.readFileSync(
        path.join(artifact.rootDir, script.mapPath)
      )
      assert.equal(sha(code), script.sha256)
      assert.equal(sha(mapBytes), script.mapSha256)
      const matching = []
      function visit(map) {
        if (map.sections) for (const section of map.sections) visit(section.map)
        else
          for (let index = 0; index < (map.sources ?? []).length; index++)
            if (map.sources[index] === identity)
              matching.push(map.sourcesContent?.[index])
      }
      visit(JSON.parse(mapBytes))
      if (matching.length) {
        assert(matching.every((value) => value === pristine.subject))
        const directory = path.join(
          output,
          'emitted',
          path.dirname(script.path)
        )
        fs.mkdirSync(directory, { recursive: true })
        fs.writeFileSync(path.join(output, 'emitted', script.path), code)
        fs.mkdirSync(
          path.dirname(path.join(output, 'emitted', script.mapPath)),
          { recursive: true }
        )
        fs.writeFileSync(path.join(output, 'emitted', script.mapPath), mapBytes)
        owners.push(script)
      }
    }
    assert(
      owners.length > 0,
      'Actual compiler output must declare the unchanged pure source'
    )
    const events = [],
      captures = []
    let mapped
    const result = await load(
      path.join(base, 'execution/execute')
    ).executeWithEnvironment(
      artifact,
      {
        runId: randomUUID(),
        entry,
        signal,
        projectDir: fixture,
        setupFiles: [],
        snapshotUpdateMode: 'none',
        testTimeout: 1000,
        hookTimeout: 1000,
        fileTimeout: 10000,
        coverage: { version: 1, kind: 'node-line' },
        onEvent: (event) => events.push(event),
        onCoverage: async (completion) => {
          captures.push(completion)
          fs.writeFileSync(
            path.join(output, 'CAPTURE.json'),
            JSON.stringify(completion, null, 2) + '\n'
          )
          assert.equal(completion.complete, true)
          mapped = await load(
            path.join(base, 'coverage/istanbul')
          ).remapStandardCoverage(
            artifact,
            completion.data,
            (file) => file === subject
          )
        },
      },
      process.env
    )
    fs.writeFileSync(
      path.join(output, 'OBSERVED.json'),
      JSON.stringify({ result, events, captures }, null, 2) + '\n'
    )
    assert.equal(result.status, 'failed')
    assert.equal(captures.length, 1)
    assert.deepEqual(
      events
        .filter((event) => event.type === 'case-end')
        .map((event) => event.status),
      ['failed', 'passed']
    )
    assert.equal(
      events.filter(
        (event) =>
          event.type === 'diagnostic' &&
          event.diagnostic.unhandled === 'rejection'
      ).length,
      1
    )
    const loaded = owners
      .map((owner) => ({
        owner,
        actual: captures[0].data.scripts.find(
          (script) => script.path === owner.path
        ),
      }))
      .filter(({ actual }) => actual !== undefined)
    assert(
      loaded.length > 0,
      'Compiler source owner must occur in actual V8 capture'
    )
    for (const { owner, actual } of loaded)
      assert.equal(actual.sha256, owner.sha256)
    assert(
      loaded.some(({ actual }) =>
        actual.functions.some((fn) =>
          fn.ranges.some((range) => range.count > 0)
        )
      )
    )
    assert.equal(mapped.complete, true)
    assert.deepEqual(mapped.errors, [])
    assert.equal(mapped.files.length, 1)
    assert.equal(mapped.files[0].file, subject)
    assert.equal(mapped.files[0].sha256, pristine.subjectSHA256)
    fs.writeFileSync(path.join(output, 'REMAPPED.v8'), serialize(mapped))
    const reportData = JSON.parse(
      JSON.stringify({ [subject]: mapped.files[0].data })
    )
    fs.writeFileSync(
      path.join(output, 'REMAPPED-REPORT.json'),
      JSON.stringify(reportData, null, 2) + '\n'
    )
    assert.deepEqual(
      canonical(reportData),
      canonical(JSON.parse(pristine.reports['coverage-final.json']))
    )
    fs.writeFileSync(
      path.join(output, 'PRIVATE-CHECKS.json'),
      JSON.stringify({
        exactCompilerSource: identity,
        sha256: pristine.subjectSHA256,
        actualOwnerScripts: owners.map(({ path, sha256 }) => ({
          path,
          sha256,
        })),
        actualLoadedScripts: loaded.map(({ actual }) => ({
          path: actual.path,
          sha256: actual.sha256,
        })),
        actualCompilerDeclaration: true,
        actualLoadedScript: true,
        completePrivateCounterMap: true,
        sourceUnchanged: true,
      }) + '\n'
    )
    assertAuthored(fixture)
  } finally {
    await session?.dispose()
    fs.writeFileSync(
      path.join(output, 'PRIVATE-CLOSED.json'),
      JSON.stringify({ compilerJoined: true }) + '\n'
    )
  }
} else {
  fs.mkdirSync(output, { recursive: true })
  const fixture = fs.realpathSync(
    fs.mkdtempSync(path.join(consumer, '.next-pure-node-v8-'))
  )
  try {
    for (const [name, bytes] of Object.entries({
      'body.test.mjs': pristine.entry,
      'subject.mjs': pristine.subject,
      'vitest.config.mjs': pristine.config,
      'package.json': '{"type":"module"}\n',
      'next.config.mjs':
        'export default ' +
        JSON.stringify({ turbopack: { root: consumer } }) +
        '\n',
    }))
      fs.writeFileSync(path.join(fixture, name), bytes)
    const privateOutput = path.join(output, 'private')
    fs.mkdirSync(privateOutput)
    const privateOwner = await runOwnedNode(
      [
        fileURLToPath(import.meta.url),
        consumer,
        privateOutput,
        '--private-child',
        '--fixture=' + fixture,
        ...(source ? ['--source'] : []),
      ],
      {
        cwd: fixture,
        env: environment(),
        auditDir: path.join(output, 'private-owners'),
        timeoutMs: 120000,
      }
    )
    fs.writeFileSync(
      path.join(output, 'PRIVATE-OWNER.json'),
      JSON.stringify(privateOwner, null, 2) + '\n'
    )
    fs.writeFileSync(path.join(output, 'private.stdout'), privateOwner.stdout)
    fs.writeFileSync(path.join(output, 'private.stderr'), privateOwner.stderr)
    assertOwnedNodeCompleted(
      privateOwner,
      'actual pure-source compiler and capture'
    )
    assert.equal(privateOwner.status, 0, privateOwner.stderr)
    const owner = await runOwnedNode(
      [
        source
          ? path.join(consumer, 'packages/next/dist/bin/next')
          : load.resolve('next/dist/bin/next'),
        'test',
        fixture,
        '--run',
        '--reporter=json',
        '--outputFile=' + path.join(output, 'cases.json'),
      ],
      {
        cwd: fixture,
        env: environment(),
        auditDir: path.join(output, 'public-owners'),
        timeoutMs: 120000,
      }
    )
    fs.writeFileSync(
      path.join(output, 'PUBLIC-OWNER.json'),
      JSON.stringify(owner, null, 2) + '\n'
    )
    fs.writeFileSync(path.join(output, 'public.stdout'), owner.stdout)
    fs.writeFileSync(path.join(output, 'public.stderr'), owner.stderr)
    assertOwnedNodeCompleted(owner, 'public pure-source reports')
    assert.equal(owner.status, pristine.exitCode, owner.stderr)
    const report = JSON.parse(fs.readFileSync(path.join(output, 'cases.json')))
    assert.deepEqual(caseProjection(report), caseProjection(pristine.cases))
    const frames = (value) =>
      value.testResults.flatMap((file) =>
        file.assertionResults.flatMap((test) =>
          test.failureMessages.flatMap((message) =>
            [...message.matchAll(/body\.test\.mjs:(\d+):(\d+)/g)].map(
              (match) => ({
                file: 'body.test.mjs',
                line: Number(match[1]),
                column: Number(match[2]),
              })
            )
          )
        )
      )
    const actualFrames = frames(report),
      expectedFrames = frames(pristine.cases)
    assert(actualFrames.length && expectedFrames.length)
    assert.deepEqual(
      actualFrames.map(({ file, line }) => ({ file, line })),
      expectedFrames.map(({ file, line }) => ({ file, line }))
    )
    fs.writeFileSync(
      path.join(output, 'FRAME-LIMITS.json'),
      JSON.stringify(
        {
          actual: actualFrames,
          reference: expectedFrames,
          columnsEqual:
            JSON.stringify(actualFrames) === JSON.stringify(expectedFrames),
          scope:
            'Full authored messages/statuses and authored file/line asserted; raw frame columns/presentation retained and separately unqualified.',
        },
        null,
        2
      ) + '\n'
    )
    assert.deepEqual(
      fs.readdirSync(path.join(fixture, 'coverage')).sort(),
      Object.keys(pristine.reports).sort()
    )
    fs.mkdirSync(path.join(output, 'coverage'))
    for (const [name, expected] of Object.entries(pristine.reports)) {
      const bytes = fs.readFileSync(
        path.join(fixture, 'coverage', name),
        'utf8'
      )
      fs.writeFileSync(path.join(output, 'coverage', name), bytes)
      if (name.endsWith('.json'))
        assert.deepEqual(
          canonical(JSON.parse(bytes)),
          canonical(JSON.parse(expected))
        )
      else assert.equal(bytes, expected)
    }
    assert.deepEqual(
      canonical(report.coverageMap),
      canonical(JSON.parse(pristine.reports['coverage-final.json']))
    )
    assert.deepEqual(report.snapshot, pristine.cases.snapshot)
    assertAuthored(fixture)
    const result = {
      actualCompilerDeclaration: true,
      actualLoadedScript: true,
      completePrivateCounterMap: true,
      publicCompleteReports: 3,
      sourceUnchanged: true,
      ownersJoined: true,
    }
    fs.writeFileSync(
      path.join(output, 'CHECKS.json'),
      JSON.stringify(result, null, 2) + '\n'
    )
    console.log(JSON.stringify(result))
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true })
    fs.writeFileSync(
      path.join(output, 'CLOSED.json'),
      JSON.stringify({ fixtureRetired: !fs.existsSync(fixture) }) + '\n'
    )
  }
}
