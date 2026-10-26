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
const [consumerArg, outputArg, name, phase = 'supervise'] =
    process.argv.slice(2),
  consumer = resolve(consumerArg),
  output = resolve(outputArg)
mkdirSync(output, { recursive: true })
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
  const owner = await runOwnedNode(
    [fileURLToPath(import.meta.url), consumer, output, name, 'child'],
    { cwd: consumer, env, auditDir: join(output, 'owners'), timeoutMs: 120000 }
  )
  writeFileSync(
    join(output, 'owner.json'),
    JSON.stringify(owner, null, 2) + '\n'
  )
  writeFileSync(join(output, 'stdout.log'), owner.stdout)
  writeFileSync(join(output, 'stderr.log'), owner.stderr)
  assertOwnedNodeCompleted(owner, 'actual private Istanbul beforeEach ' + name)
  assert.equal(owner.status, 0, owner.stderr)
} else {
  const here = dirname(fileURLToPath(import.meta.url)),
    pristine = JSON.parse(
      readFileSync(
        join(here, 'fixtures/istanbul-provider/beforeeach-pristine.json')
      )
    ),
    row = pristine.rows.find((row) => row.name === name)
  assert(row)
  const fixture = mkdtempSync(
      join(consumer, '.next-istanbul-beforeeach-private-')
    ),
    load = createRequire(join(consumer, 'package.json')),
    nextRoot = dirname(load.resolve('next/package.json')),
    lib = join(nextRoot, 'dist/experimental/testing'),
    events = [],
    captures = []
  let session, service
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
        id: 'istanbul-setup-private',
        mode: 'development',
        environment: 'node',
        runtime: 'nodejs',
        bundler: 'turbopack',
      },
      entry = {
        id: 'suite.test.mjs',
        file: join(fixture, 'suite.test.mjs'),
        profile,
      },
      excludedFiles = [
        entry.file,
        ...setupFiles,
        join(fixture, 'next.config.mjs'),
      ]
    process.chdir(fixture)
    const {
        createIstanbulSourcePlan,
        openIstanbulInstrumentation,
        istanbulSourceSelector,
      } = load(lib + '/coverage/istanbul-instrumentation'),
      { createTestCompilerSession } = load(lib + '/compiler'),
      { executeWithEnvironment } = load(lib + '/execution/execute'),
      { remapIstanbulCapture } = load(lib + '/coverage/istanbul-capture'),
      { mergeIstanbulCoverage } = load(
        nextRoot + '/dist/compiled/next-test-instrumentation'
      ),
      { writeReports } = load(nextRoot + '/dist/compiled/next-test-coverage')
    const plan = await createIstanbulSourcePlan({
      projectDir: fixture,
      profile,
      config,
      excludedFiles,
      signal,
    })
    service = await openIstanbulInstrumentation({
      projectDir: fixture,
      plan,
      signal,
      ...(plan.importedOnly
        ? {
            selectSource: istanbulSourceSelector(
              fixture,
              config,
              excludedFiles
            ),
          }
        : {}),
    })
    session = await createTestCompilerSession(fixture, profile, {
      istanbulInstrumentation: service.descriptor,
      ...(plan.importedOnly
        ? { readIstanbulInstrumentation: service.readMetadata }
        : {}),
    })
    const artifact = await session.compile(entry, {
      signal,
      setupFiles,
      snapshotSerializers,
      coverage: { version: 1, kind: 'node-istanbul' },
    })
    writeFileSync(
      join(output, 'ARTIFACT.json'),
      JSON.stringify(artifact, null, 2) + '\n'
    )
    assert.equal(
      artifact.diagnostics.filter((d) => d.severity === 'error').length,
      0
    )
    assert(artifact.coverage.istanbulHarness)
    const sidecar = artifact.coverage.istanbulHarness.nativeMetadata
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
        coverage: { version: 1, kind: 'node-istanbul' },
        onEvent: (event) => events.push(event),
        onIstanbulCoverage: async (completion) => {
          captures.push({
            completion,
            mapped: await remapIstanbulCapture(
              artifact,
              completion.data,
              fixture,
              signal
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
    assert.equal(result.status, 'failed')
    const starts = events.filter((event) => event.type === 'case-start')
    const ends = events.filter((event) => event.type === 'case-end')
    assert.equal(starts.length, 2)
    assert.equal(ends.length, 2)
    for (let index = 0; index < ends.length; index++) {
      assert.equal(ends[index].status, 'failed')
      assert.equal(ends[index].attempt.id, starts[index].attempt.id)
      assert.equal(ends[index].errors.length, row.independentAfterEach ? 2 : 1)
      for (const failure of ends[index].errors)
        assert.equal(
          failure.message,
          row.independentAfterEach
            ? 'same actual beforeEach and afterEach failure'
            : 'owned settled setup beforeEach failure'
        )
    }
    if (row.independentAfterEach) {
      assert.equal(captures.length, 0)
      writeFileSync(
        join(output, 'VERIFIED.json'),
        JSON.stringify(
          {
            profile: name,
            actualCaseStartsAndEnds: true,
            independentAfterEachVeto: true,
            sameOriginalErrorSeparateStageCarriers: true,
            referencePublicationDifferenceRetainedAsSeparateGap: true,
          },
          null,
          2
        ) + '\n'
      )
    } else {
      assert.equal(captures.length, 1)
      assert.equal(
        Object.hasOwn(captures[0].completion, 'settledSuiteErrors'),
        false
      )
      assert.equal(
        Object.hasOwn(captures[0].completion, 'settledFileErrors'),
        false
      )
      assert.equal(
        events.filter((event) => event.type === 'diagnostic').length,
        0
      )
      const data = mergeIstanbulCoverage(
        captures.map((capture) =>
          Object.fromEntries(
            capture.mapped.files.map((file) => [file.file, file.data])
          )
        )
      )
      // Compare the same actual provider JSON output domain as the reference.
      // In-memory Infinity/own-undefined coordinates stay untouched in data.
      mkdirSync(join(output, 'prepared-json'))
      await writeReports(data, join(output, 'prepared-json'), ['json'])
      const preparedJSON = readFileSync(
        join(output, 'prepared-json/coverage-final.json'),
        'utf8'
      )
      assert.deepEqual(
        canonical(JSON.parse(preparedJSON)),
        canonical(row.cases.coverageMap)
      )
      writeFileSync(join(output, 'MERGED-MAP.json'), preparedJSON)
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
            actualBeforeEachAttemptCarriers: true,
            actualCaseStartsAndEnds: true,
            actualMapIndependentOfReportFilePolicy: true,
          },
          null,
          2
        ) + '\n'
      )
    }
    const actual = load(join(artifact.rootDir, artifact.entryPath))
    const imports = actual.initializeModuleImportTracking?.()
    const file = actual.testRunner.initializeTestFile({
      publicTaskSelection: true,
      onUnhandledRejection() {},
      snapshotBodyFailures: true,
      nativeBeforeEachAssertions: true,
      nativeAfterEachAssertions: true,
      nativeBeforeEachCleanupAssertions: true,
      fileId: entry.id,
      filePath: entry.file,
      snapshotUpdateMode: 'none',
      waitForImports: imports?.waitForImports,
      testTimeout: 10000,
      hookTimeout: 1000,
    })
    try {
      await file.collect(async () => {
        await actual.loadSetupModules('list')
        await actual.loadTestModule()
      })
      const direct = await file.run({
        runId: randomUUID(),
        signal,
        projectDir: fixture,
        hookTimeout: 1000,
        testTimeout: 10000,
        captureCoverageCompletion: true,
      })
      await file.dispose()
      const operations = file.getOperationSettlement()
      assert.equal(direct.interrupted, false)
      assert.deepEqual(
        direct.cases.map((row) => row.status),
        ['failed', 'failed']
      )
      assert.deepEqual(direct.errors, [])
      assert.deepEqual(file.getNativeBodySettlement().invocations, [])
      assert.equal(operations.bounded.pending, 0)
      assert.equal(operations.around.pending, 0)
      assert.equal(operations.pendingHooks, 0)
      assert(operations.bounded.observed > 0)
      const completion = file.getCompletedCoverageFailures()
      if (row.independentAfterEach) assert.equal(completion, undefined)
      else assert.deepEqual(completion, [])
      writeFileSync(
        join(output, 'ACTUAL-RUNNER-FACTS.json'),
        JSON.stringify(
          {
            bodyInvocations: file.getNativeBodySettlement().invocations,
            operations,
            cases: direct.cases.map((row) => ({
              status: row.status,
              attempt: row.attempt,
              errors: row.errors.map((failure) => ({
                phase: failure.phase,
                name: failure.error.name,
                message: failure.error.message,
              })),
            })),
            completion,
          },
          null,
          2
        ) + '\n'
      )
    } finally {
      await file.dispose()
      await imports?.dispose()
    }
  } finally {
    await session?.dispose()
    await service?.dispose()
    rmSync(fixture, { recursive: true, force: true })
    writeFileSync(
      join(output, 'CLOSED.json'),
      JSON.stringify({
        fixtureRetired: !existsSync(fixture),
        compilerDisposed: !!session,
        brokerDisposed: !!service,
      }) + '\n'
    )
  }
}
