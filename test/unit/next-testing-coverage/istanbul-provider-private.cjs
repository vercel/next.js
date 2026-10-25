const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  { randomUUID } = require('node:crypto')
const { createRequire } = require('node:module')
const { serialize } = require('node:v8')
const [consumerArg, outputArg] = process.argv.slice(2)
assert(consumerArg && outputArg)
const repo = path.resolve(consumerArg),
  out = path.resolve(outputArg),
  req = createRequire(path.join(repo, 'package.json')),
  nextRoot = path.dirname(req.resolve('next/package.json')),
  m = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, 'fixtures/istanbul-provider/pristine.json')
    )
  ),
  fixture = fs.mkdtempSync(path.join(repo, '.next-istanbul-private-model-')),
  testRoot = path.join(nextRoot, 'dist/experimental/testing')
if (!process.argv.includes('--source'))
  for (const name of ['vitest', 'vite']) assert.throws(() => req.resolve(name))
fs.mkdirSync(out, { recursive: true })
process.chdir(fixture)
process.env.NODE_ENV = 'development'
const profile = {
    id: 'private-istanbul-development',
    mode: 'development',
    environment: 'node',
    runtime: 'nodejs',
    bundler: 'turbopack',
  },
  controller = new AbortController(),
  events = [],
  facts = [],
  results = [],
  captures = []
let session, service
const boundaryFacts = []
const retiredSessions = []
;(async () => {
  try {
    for (const [name, file] of Object.entries(m.sourceFiles))
      fs.writeFileSync(path.join(fixture, name), file.source)
    fs.writeFileSync(
      path.join(fixture, 'next.config.mjs'),
      'export default ' + JSON.stringify({ turbopack: { root: repo } }) + '\n'
    )
    const config = {
      reporter: ['json', 'json-summary', 'lcovonly'],
      formatterReports: true,
      include: ['subject.mjs', 'fully.mjs', 'unimported.mjs'],
      exclude: [],
      reportsDirectory: 'coverage',
      reportOnFailure: false,
      thresholds: {},
    }
    const { createIstanbulSourcePlan, openIstanbulInstrumentation } = require(
        path.join(testRoot, 'coverage/istanbul-instrumentation')
      ),
      { remapIstanbulCapture } = require(
        path.join(testRoot, 'coverage/istanbul-capture')
      ),
      { createTestCompilerSession } = require(path.join(testRoot, 'compiler')),
      { executeWithEnvironment } = require(
        path.join(testRoot, 'execution/execute')
      ),
      { mergeIstanbulCoverage } = require(
        path.join(nextRoot, 'dist/compiled/next-test-instrumentation')
      ),
      { writeReports } = require(
        path.join(nextRoot, 'dist/compiled/next-test-coverage')
      )
    const plan = await createIstanbulSourcePlan({
      projectDir: fixture,
      profile,
      config,
      excludedFiles: [],
      signal: controller.signal,
    })
    assert.equal(plan.sources.length, 3)
    service = await openIstanbulInstrumentation({
      projectDir: fixture,
      plan,
      signal: controller.signal,
    })
    fs.writeFileSync(
      path.join(out, 'INSTRUMENTER-METADATA-RAW.v8'),
      serialize(service.descriptor.metadata)
    )
    fs.writeFileSync(
      path.join(out, 'INSTRUMENTER-METADATA-JSON.json'),
      JSON.stringify(service.descriptor.metadata, null, 2) + '\n'
    )
    session = await createTestCompilerSession(fixture, profile, {
      istanbulInstrumentation: service.descriptor,
    })
    for (const name of ['contract.test.mjs', 'full.test.mjs']) {
      const entry = { id: name, file: path.join(fixture, name), profile },
        artifact = await session.compile(entry, {
          signal: controller.signal,
          coverage: { version: 1, kind: 'node-istanbul' },
        })
      fs.writeFileSync(
        path.join(out, name + '.artifact.json'),
        JSON.stringify(artifact, null, 2) + '\n'
      )
      assert.equal(
        artifact.diagnostics.filter((d) => d.severity === 'error').length,
        0,
        JSON.stringify(artifact.diagnostics)
      )
      assert(artifact.coverage.istanbul)
      assert.equal(artifact.coverage.sourcePreservation, undefined)
      assert.equal(artifact.coverage.importRoles, undefined)
      let delivered = 0
      const result = await executeWithEnvironment(
        artifact,
        {
          runId: randomUUID(),
          signal: controller.signal,
          projectDir: fixture,
          entry,
          setupFiles: [],
          snapshotSerializers: [],
          snapshotUpdateMode: 'none',
          testTimeout: 10000,
          hookTimeout: 1000,
          fileTimeout: 20000,
          coverage: { version: 1, kind: 'node-istanbul' },
          includeTaskLocation: true,
          onEvent(event) {
            events.push(event)
          },
          async onIstanbulCoverage(completion) {
            delivered++
            assert(completion.complete)
            captures.push(completion)
            facts.push(
              await remapIstanbulCapture(
                artifact,
                completion.data,
                fixture,
                controller.signal
              )
            )
          },
        },
        process.env
      )
      results.push(result)
      fs.writeFileSync(
        path.join(out, 'OBSERVED.json'),
        JSON.stringify({ plan, events, facts, results, captures }, null, 2) +
          '\n'
      )
      assert.equal(delivered, 1)
      assert.equal(result.status, 'passed', JSON.stringify(result))
      if (name === 'contract.test.mjs')
        await assert.rejects(
          () => session.compile(entry, { signal: controller.signal }),
          /matching instrumentation request and descriptor/
        )
      if (name === 'contract.test.mjs') {
        await session.shutdownCompilation()
        retiredSessions.push(session)
        const ordinaryFile = path.join(fixture, 'ordinary.test.mjs')
        fs.writeFileSync(
          ordinaryFile,
          "import {test,expect} from 'vitest'\nimport {choose} from './subject.mjs'\ntest('ordinary request has no instrumentation',()=>{expect(choose(true)).toBe(1);expect(globalThis.__VITEST_COVERAGE__).toBeUndefined()})\n"
        )
        const ordinary = await createTestCompilerSession(fixture, profile)
        try {
          const entry = { id: 'ordinary', file: ordinaryFile, profile }
          const compiled = await ordinary.compile(entry, {
            signal: controller.signal,
          })
          assert.equal(compiled.coverage, undefined)
          const ordinaryEvents = []
          const result = await executeWithEnvironment(
            compiled,
            {
              runId: randomUUID(),
              signal: controller.signal,
              projectDir: fixture,
              entry,
              setupFiles: [],
              onEvent(event) {
                ordinaryEvents.push(event)
              },
            },
            process.env
          )
          assert.equal(result.status, 'passed', JSON.stringify(result))
          assert.equal(
            ordinaryEvents.filter((e) => e.type === 'case-end').length,
            1
          )
          boundaryFacts.push('ordinary request has no collector or counters')
          const legacy = await ordinary.compile(entry, {
            signal: controller.signal,
            coverage: { version: 1, kind: 'node-line' },
          })
          assert.equal(legacy.coverage.istanbul, undefined)
          let legacyDeliveries = 0
          const legacyEvents = [],
            legacyCaptures = []
          const legacyResult = await executeWithEnvironment(
            legacy,
            {
              runId: randomUUID(),
              signal: controller.signal,
              projectDir: fixture,
              entry,
              setupFiles: [],
              coverage: { version: 1, kind: 'node-line' },
              onEvent(event) {
                legacyEvents.push(event)
              },
              async onCoverage(completion) {
                legacyCaptures.push(completion)
                assert(completion.complete)
                assert.equal(completion.data.version, 1)
                assert.equal(Object.hasOwn(completion.data, 'kind'), false)
                assert(completion.data.scripts.length > 0)
                legacyDeliveries++
              },
            },
            process.env
          )
          fs.writeFileSync(
            path.join(out, 'ORDINARY-V8.json'),
            JSON.stringify(
              {
                result: legacyResult,
                events: legacyEvents,
                captures: legacyCaptures,
              },
              null,
              2
            ) + '\n'
          )
          assert.equal(
            legacyResult.status,
            'passed',
            JSON.stringify(legacyResult)
          )
          assert.equal(legacyDeliveries, 1)
          boundaryFacts.push(
            'ordinary V8 request retains its actual inspector collector'
          )
        } finally {
          await ordinary.dispose()
        }
        session = await createTestCompilerSession(fixture, profile, {
          istanbulInstrumentation: service.descriptor,
        })
      }
    }
    const firstArtifact = JSON.parse(
      fs.readFileSync(path.join(out, 'contract.test.mjs.artifact.json'))
    )
    const { assertCoverageRequest } = require(
      path.join(testRoot, 'execution/coverage')
    )
    const { startCoverage } = require(path.join(testRoot, 'coverage/collector'))
    const { startIstanbulCoverage } = require(
      path.join(testRoot, 'coverage/istanbul-capture')
    )
    for (const request of [
      {},
      { coverage: { version: 1, kind: 'node-line' }, onCoverage() {} },
      {
        coverage: { version: 1, kind: 'node-istanbul' },
        onCoverage() {},
        onIstanbulCoverage() {},
      },
    ])
      assert.throws(() => assertCoverageRequest(firstArtifact, request))
    await assert.rejects(() => startCoverage(firstArtifact), /V8 collection/)
    boundaryFacts.push('absent and V8 requests cannot consume instrumentation')
    const capture = captures[0].data
    for (const mutate of [
      (c) => (c.kind = 'node-line'),
      (c) => (c.files['/unselected.mjs'] = Object.values(c.files)[0]),
      (c) => {
        const data = Object.values(c.files)[0]
        data.s[Object.keys(data.s)[0]] = -1
      },
      (c) => {
        const data = Object.values(c.files)[0]
        data.statementMap[Object.keys(data.statementMap)[0]].start.column++
      },
      (c) => {
        const data = Object.values(c.files)[0]
        data.inputSourceMap.mappings += 'A'
      },
    ]) {
      const changed = structuredClone(capture)
      mutate(changed)
      await assert.rejects(() =>
        remapIstanbulCapture(firstArtifact, changed, fixture, controller.signal)
      )
    }
    boundaryFacts.push(
      'changed capture kind, files, counters, declarations and input map refuse'
    )
    const selected = path.join(fixture, 'subject.mjs')
    const selectedBytes = fs.readFileSync(selected)
    try {
      fs.appendFileSync(selected, '\n// changed after capture\n')
      await assert.rejects(
        () =>
          remapIstanbulCapture(
            firstArtifact,
            capture,
            fixture,
            controller.signal
          ),
        /source or actual instrumenter map changed/
      )
    } finally {
      fs.writeFileSync(selected, selectedBytes)
    }
    const script = firstArtifact.coverage.scripts.find((file) => file.mapPath)
    assert(script)
    const mapFile = path.join(firstArtifact.rootDir, script.mapPath)
    const mapBytes = fs.readFileSync(mapFile)
    try {
      fs.appendFileSync(mapFile, '\n')
      await assert.rejects(
        () =>
          remapIstanbulCapture(
            firstArtifact,
            capture,
            fixture,
            controller.signal
          ),
        /emitted script or source map changed/
      )
    } finally {
      fs.writeFileSync(mapFile, mapBytes)
    }
    boundaryFacts.push(
      'actual source and emitted map edits refuse before remapping'
    )
    const previousCoverage = Object.getOwnPropertyDescriptor(
      globalThis,
      '__VITEST_COVERAGE__'
    )
    try {
      globalThis.__VITEST_COVERAGE__ = structuredClone(capture.files)
      const collector = await startIstanbulCoverage(firstArtifact, fixture)
      try {
        const reset = await collector.stop()
        assert(
          Object.values(reset.files).every(
            (file) =>
              Object.values(file.s).every((count) => count === 0) &&
              Object.values(file.f).every((count) => count === 0) &&
              Object.values(file.b)
                .flat()
                .every((count) => count === 0)
          )
        )
        await assert.rejects(() => collector.stop(), /already stopped/)
      } finally {
        await collector.dispose()
      }
    } finally {
      if (previousCoverage)
        Object.defineProperty(
          globalThis,
          '__VITEST_COVERAGE__',
          previousCoverage
        )
      else delete globalThis.__VITEST_COVERAGE__
    }
    boundaryFacts.push('actual existing counters reset once before bootstrap')
    const entry = {
      id: 'contract.test.mjs',
      file: path.join(fixture, 'contract.test.mjs'),
      profile,
    }
    const cancelled = new AbortController()
    let interruptedStarts = 0,
      interruptedDeliveries = 0
    const interrupted = await executeWithEnvironment(
      firstArtifact,
      {
        runId: randomUUID(),
        signal: cancelled.signal,
        projectDir: fixture,
        entry,
        setupFiles: [],
        snapshotUpdateMode: 'none',
        testTimeout: 10000,
        hookTimeout: 1000,
        fileTimeout: 20000,
        coverage: { version: 1, kind: 'node-istanbul' },
        onEvent(event) {
          if (event.type === 'case-start') {
            interruptedStarts++
            cancelled.abort(new Error('private Istanbul cancellation'))
          }
        },
        async onIstanbulCoverage() {
          interruptedDeliveries++
        },
      },
      process.env
    )
    assert.equal(interruptedStarts, 1)
    assert.equal(interrupted.status, 'cancelled', JSON.stringify(interrupted))
    assert.equal(interruptedDeliveries, 0)
    assert.equal(fs.existsSync(path.join(fixture, 'coverage')), false)
    boundaryFacts.push('actual cancellation publishes no counters or reports')
    let recovered = 0
    const recovery = await executeWithEnvironment(
      firstArtifact,
      {
        runId: randomUUID(),
        signal: controller.signal,
        projectDir: fixture,
        entry,
        setupFiles: [],
        snapshotUpdateMode: 'none',
        testTimeout: 10000,
        hookTimeout: 1000,
        fileTimeout: 20000,
        coverage: { version: 1, kind: 'node-istanbul' },
        onEvent() {},
        async onIstanbulCoverage(completion) {
          assert(completion.complete)
          const mapped = await remapIstanbulCapture(
            firstArtifact,
            completion.data,
            fixture,
            controller.signal
          )
          assert.deepEqual(mapped.files, facts[0].files)
          recovered++
        },
      },
      process.env
    )
    assert.equal(recovery.status, 'passed', JSON.stringify(recovery))
    assert.equal(recovered, 1)
    boundaryFacts.push('fresh worker recovers exact original complete maps')
    fs.writeFileSync(
      path.join(out, 'BOUNDARIES.json'),
      JSON.stringify(
        { passed: boundaryFacts, selectedAbsentSelected: true },
        null,
        2
      ) + '\n'
    )
    const data = mergeIstanbulCoverage(
      facts.map((f) =>
        Object.fromEntries(f.files.map((file) => [file.file, file.data]))
      )
    )
    fs.mkdirSync(path.join(out, 'coverage'))
    await writeReports(data, path.join(out, 'coverage'), [
      'json',
      'json-summary',
      'lcovonly',
    ])
    const norm = (v) => JSON.stringify(v).replaceAll(fixture, '<FIXTURE>')
    for (const file of ['coverage-final.json', 'coverage-summary.json'])
      assert.equal(
        norm(JSON.parse(fs.readFileSync(path.join(out, 'coverage', file)))),
        norm(m.reports[file])
      )
    assert.equal(
      fs
        .readFileSync(path.join(out, 'coverage/lcov.info'), 'utf8')
        .replaceAll(fixture, '<FIXTURE>'),
      m.reports['lcov.info']
    )
    const passed = events.filter((e) => e.type === 'case-end')
    assert.equal(passed.length, 2)
    assert(passed.every((e) => e.status === 'passed'))
    fs.writeFileSync(
      path.join(out, 'CHECKS.json'),
      JSON.stringify(
        {
          actualPrivateCompilerWorkerCases: 2,
          wholeThreeFileJSONSummaryLCOVEqual: true,
          actualCountersOnly: true,
          noV8Certificate: true,
          deliveredAfterWorkerCleanup: captures.length,
          unimportedMapZero: true,
          publicAdmission: false,
        },
        null,
        2
      ) + '\n'
    )
  } finally {
    if (session) await session.dispose()
    for (const retired of retiredSessions) await retired.dispose()
    if (service) await service.dispose()
    fs.rmSync(fixture, { recursive: true, force: true })
    fs.writeFileSync(
      path.join(out, 'CLOSED.json'),
      JSON.stringify({
        fixtureRetired: !fs.existsSync(fixture),
        sessionDisposed: !!session,
        serviceDisposed: !!service,
      }) + '\n'
    )
  }
})().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
