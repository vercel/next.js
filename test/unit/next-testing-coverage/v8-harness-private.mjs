import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  existsSync,
} from 'node:fs'
import { join, resolve, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
const [consumerArg, outputArg, name, phaseArg] = process.argv.slice(2),
  phase = phaseArg === 'child' ? 'child' : 'supervise',
  consumer = resolve(consumerArg),
  output = resolve(outputArg)
mkdirSync(output, { recursive: true })
const mutations = process.argv.includes('--mutations')
if (phase === 'supervise') {
  const env = {
    ...process.env,
    CI: '1',
    NODE_ENV: 'development',
    NEXT_TELEMETRY_DISABLED: '1',
    TURBO_TASKS_AVAILABLE_PARALLELISM: '4',
  }
  delete env.NODE_OPTIONS
  delete env.NODE_PATH
  delete env.NEXT_TEST_NATIVE_DIR
  delete env.NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL
  const owner = await runOwnedNode(
    [
      fileURLToPath(import.meta.url),
      consumer,
      output,
      name,
      'child',
      ...(mutations ? ['--mutations'] : []),
    ],
    { cwd: consumer, env, auditDir: join(output, 'owners'), timeoutMs: 120000 }
  )
  writeFileSync(
    join(output, 'owner.json'),
    JSON.stringify(owner, null, 2) + '\n'
  )
  writeFileSync(join(output, 'stdout.log'), owner.stdout)
  writeFileSync(join(output, 'stderr.log'), owner.stderr)
  assertOwnedNodeCompleted(owner, 'actual private V8 harness ' + name)
  assert.equal(owner.status, 0, owner.stderr)
} else {
  const here = dirname(fileURLToPath(import.meta.url)),
    pristine = JSON.parse(
      readFileSync(
        join(here, 'fixtures/istanbul-provider/v8-harness-pristine.json')
      )
    ),
    row = pristine.rows.find((row) => row.name === name)
  assert(row)
  const fixture = mkdtempSync(join(consumer, '.next-v8-harness-private-')),
    load = createRequire(join(consumer, 'package.json')),
    nextRoot = dirname(load.resolve('next/package.json')),
    lib = join(nextRoot, 'dist/experimental/testing'),
    events = [],
    captures = []
  let session
  const canonical = (map) =>
    Object.fromEntries(
      Object.entries(map).map(([file, data]) => [
        file === 'total' ? file : basename(file),
        { ...data, ...('path' in data ? { path: basename(data.path) } : {}) },
      ])
    )
  try {
    for (const [file, data] of Object.entries(row.sourceFiles)) {
      assert.equal(
        createHash('sha256').update(data.source).digest('hex'),
        data.sha256
      )
      writeFileSync(join(fixture, file), data.source)
    }
    writeFileSync(
      join(fixture, 'next.config.mjs'),
      'export default ' +
        JSON.stringify({ turbopack: { root: consumer } }) +
        '\n'
    )
    mkdirSync(join(fixture, '__snapshots__'))
    for (const [file, bytes] of Object.entries(row.snapshots))
      writeFileSync(join(fixture, '__snapshots__', file), bytes)
    const config = {
        ...JSON.parse(row.config.slice('export default '.length)).test.coverage,
        exclude: [],
      },
      setup = JSON.parse(row.config.slice('export default '.length)).test,
      setupFiles = (setup.setupFiles ?? []).map((file) =>
        resolve(fixture, file)
      ),
      snapshotSerializers = [...(setup.snapshotSerializers ?? [])],
      signal = new AbortController().signal,
      profile = {
        id: 'v8-harness-private',
        mode: 'development',
        environment: 'node',
        runtime: 'nodejs',
        bundler: 'turbopack',
      },
      entry = {
        id: 'suite.test.mjs',
        file: join(fixture, 'suite.test.mjs'),
        profile,
      }
    process.chdir(fixture)
    const { createTestCompilerSession } = load(lib + '/compiler'),
      { executeWithEnvironment } = load(lib + '/execution/execute'),
      { remapStandardCoverage } = load(lib + '/coverage/istanbul'),
      { standardCoverageSourceSelector } = load(lib + '/coverage/options'),
      { mergeStandardCoverageData } = load(lib + '/coverage/report-standard'),
      { writeReports } = load(nextRoot + '/dist/compiled/next-test-coverage')
    const selectSource = standardCoverageSourceSelector(fixture, config)
    session = await createTestCompilerSession(fixture, profile)
    const artifact = await session.compile(entry, {
      signal,
      setupFiles,
      snapshotSerializers,
      coverage: { version: 1, kind: 'node-line' },
    })
    writeFileSync(
      join(output, 'ARTIFACT.json'),
      JSON.stringify(artifact, null, 2) + '\n'
    )
    assert.equal(
      artifact.diagnostics.filter((d) => d.severity === 'error').length,
      0
    )
    assert(artifact.coverage.nodeHarness)
    assert.equal(artifact.coverage.istanbulHarness, undefined)
    assert.equal(artifact.coverage.istanbul, undefined)
    assert.equal(artifact.coverage.nodeHarness.projectDir, fixture)
    const sidecar = artifact.coverage.nodeHarness.harness.nativeMetadata
    writeFileSync(
      join(output, 'NATIVE-HARNESS.json'),
      readFileSync(join(artifact.rootDir, sidecar.path))
    )
    const result = await executeWithEnvironment(
      artifact,
      {
        runId: randomUUID(),
        entry,
        signal,
        projectDir: fixture,
        setupFiles,
        snapshotSerializers,
        snapshotUpdateMode: 'none',
        testTimeout: 10000,
        hookTimeout: 1000,
        fileTimeout: 20000,
        coverage: { version: 1, kind: 'node-line' },
        onEvent: (event) => events.push(event),
        onCoverage: async (completion) => {
          writeFileSync(
            join(output, 'ACTUAL-V8-CAPTURE.json'),
            JSON.stringify(completion, null, 2) + '\n'
          )
          const emitted = []
          const sources = (map) => [
            ...(map.sources ?? []),
            ...(map.sections ?? []).flatMap((section) => sources(section.map)),
          ]
          for (const script of artifact.coverage.scripts) {
            if (!script.mapPath) continue
            const bytes = readFileSync(join(artifact.rootDir, script.mapPath))
            if (
              !sources(JSON.parse(bytes)).some((source) =>
                source.endsWith('/serializer.mjs')
              )
            )
              continue
            const prefix = 'ACTUAL-SERIALIZER-' + emitted.length
            writeFileSync(
              join(output, prefix + '.js'),
              readFileSync(join(artifact.rootDir, script.path))
            )
            writeFileSync(join(output, prefix + '.js.map'), bytes)
            emitted.push({ ...script, savedPrefix: prefix })
          }
          writeFileSync(
            join(output, 'ACTUAL-SERIALIZER-ARTIFACTS.json'),
            JSON.stringify(emitted, null, 2) + '\n'
          )
          captures.push({
            completion,
            mapped: await remapStandardCoverage(
              artifact,
              completion.data,
              selectSource
            ),
          })
        },
      },
      process.env
    )
    writeFileSync(
      join(output, 'OBSERVED.json'),
      JSON.stringify({ result, events, captures }, null, 2) + '\n'
    )
    assert.equal(result.status, row.exitCode === 0 ? 'passed' : 'failed')
    assert.equal(captures.length, 1)
    assert.deepEqual(
      events
        .filter((e) => e.type === 'case-end')
        .map((e) => ({ name: e.name, status: e.status })),
      row.cases.testResults[0].assertionResults.map((test) => ({
        name: test.title,
        status: test.status,
      }))
    )
    const mutationChecks = []
    if (mutations) {
      const { verifyNodeHarnessCoverage } = load(lib + '/coverage/node-harness')
      const { assertCoverageRequest } = load(lib + '/execution/coverage')
      const reject = async (name, action) => {
        await assert.rejects(action)
        mutationChecks.push(name)
      }
      let altered = structuredClone(artifact)
      delete altered.coverage.nodeHarness
      await reject('missing exact role', () =>
        verifyNodeHarnessCoverage(altered)
      )
      altered = structuredClone(artifact)
      altered.coverage.nodeHarness.harness.sources[0].sha256 = 'a'.repeat(64)
      await reject('source fact mismatch', () =>
        verifyNodeHarnessCoverage(altered)
      )
      altered = structuredClone(artifact)
      altered.snapshotSerializers = ['./different-serializer.mjs']
      await reject('original serializer request mismatch', () =>
        verifyNodeHarnessCoverage(altered)
      )
      altered = structuredClone(artifact)
      altered.profile.mode = 'production'
      await reject('unrequested production role', () =>
        verifyNodeHarnessCoverage(altered)
      )
      altered = structuredClone(artifact)
      altered.coverage.sources[
        artifact.coverage.nodeHarness.harness.sources[0].source
      ] = {
        file: entry.file,
        sha256: artifact.sourceHash,
      }
      await reject('authored generated role collision', () =>
        verifyNodeHarnessCoverage(altered)
      )
      assert.throws(
        () => assertCoverageRequest(artifact, {}),
        /Native Node harness/
      )
      mutationChecks.push('no coverage request')
      const nativePath = join(artifact.rootDir, sidecar.path)
      const nativeBytes = readFileSync(nativePath)
      try {
        writeFileSync(
          nativePath,
          Buffer.concat([nativeBytes, Buffer.from('\n')])
        )
        await reject('sidecar bytes changed', () =>
          verifyNodeHarnessCoverage(artifact)
        )
      } finally {
        writeFileSync(nativePath, nativeBytes)
      }
      const mappedScript = artifact.coverage.scripts.find(
        (script) => script.mapPath
      )
      assert(mappedScript)
      const mapPath = join(artifact.rootDir, mappedScript.mapPath),
        mapBytes = readFileSync(mapPath)
      try {
        writeFileSync(mapPath, Buffer.concat([mapBytes, Buffer.from('\n')]))
        await reject('map bytes changed', () =>
          remapStandardCoverage(
            artifact,
            captures[0].completion.data,
            selectSource
          )
        )
      } finally {
        writeFileSync(mapPath, mapBytes)
      }
      await verifyNodeHarnessCoverage(artifact)
      const zero = await session.compile(entry, {
        signal,
        setupFiles: [],
        snapshotSerializers: [],
        coverage: { version: 1, kind: 'node-line' },
      })
      assert.equal(zero.coverage.nodeHarness, undefined)
      assert.equal(zero.coverage.istanbulHarness, undefined)
      assert(
        !zero.files.includes(
          zero.entryPath.replace(/\.js$/, '.harness-coverage.json')
        )
      )
      await verifyNodeHarnessCoverage(zero)
      mutationChecks.push('actual zero-wrapper absence')
    }
    const data = {}
    for (const capture of captures)
      for (const file of capture.mapped.files)
        data[file.file] = data[file.file]
          ? mergeStandardCoverageData(data[file.file], file.data)
          : file.data
    mkdirSync(join(output, 'coverage'))
    await writeReports(data, join(output, 'coverage'), [
      'json',
      'json-summary',
      'lcovonly',
    ])
    for (const [file, expected] of Object.entries(row.reports)) {
      const actual = readFileSync(join(output, 'coverage', file), 'utf8')
      if (file.endsWith('.json'))
        assert.deepEqual(
          canonical(JSON.parse(actual)),
          canonical(JSON.parse(expected))
        )
      else assert.equal(actual, expected)
    }
    for (const [file, expected] of Object.entries(row.snapshots))
      assert.equal(
        readFileSync(join(fixture, '__snapshots__', file), 'utf8'),
        expected
      )
    writeFileSync(
      join(output, 'VERIFIED.json'),
      JSON.stringify(
        {
          profile: name,
          privateCompilerWorker: true,
          caseStatusesExact: true,
          completeReportsExact: true,
          snapshotBytesExact: true,
          actualNativeHarness: true,
          actualV8Capture: true,
          mutationChecks,
        },
        null,
        2
      ) + '\n'
    )
  } finally {
    await session?.dispose()
    rmSync(fixture, { recursive: true, force: true })
    writeFileSync(
      join(output, 'CLOSED.json'),
      JSON.stringify({
        fixtureRetired: !existsSync(fixture),
        compilerDisposed: !!session,
      }) + '\n'
    )
  }
}
