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
const [consumerArg, outputArg, name, phaseArg] = process.argv.slice(2)
const phase = phaseArg === 'child' ? 'child' : 'supervise'
const fault = process.argv
  .find((arg) => arg.startsWith('--fault='))
  ?.slice('--fault='.length)
const consumer = resolve(consumerArg),
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
    [
      fileURLToPath(import.meta.url),
      consumer,
      output,
      name,
      'child',
      ...(fault ? ['--fault=' + fault] : []),
    ],
    { cwd: consumer, env, auditDir: join(output, 'owners'), timeoutMs: 120000 }
  )
  writeFileSync(
    join(output, 'owner.json'),
    JSON.stringify(owner, null, 2) + '\n'
  )
  writeFileSync(join(output, 'stdout.log'), owner.stdout)
  writeFileSync(join(output, 'stderr.log'), owner.stderr)
  assertOwnedNodeCompleted(owner, 'actual private Istanbul collection ' + name)
  assert.equal(owner.status, 0, owner.stderr)
} else {
  const here = dirname(fileURLToPath(import.meta.url)),
    pristine = JSON.parse(
      readFileSync(
        join(here, 'fixtures/istanbul-provider/spec-collection-pristine.json')
      )
    ),
    row = pristine.rows.find((row) => row.name === name)
  assert(row)
  const fixture = mkdtempSync(
      join(consumer, '.next-istanbul-spec-collection-private-')
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
    const config = load(lib + '/coverage/options').parseProjectStandardCoverage(
        JSON.parse(row.config.slice('export default '.length)).test.coverage
      ).options,
      setup = JSON.parse(row.config.slice('export default '.length)).test,
      setupFiles = (setup.setupFiles ?? []).map((file) =>
        resolve(fixture, file)
      ),
      snapshotSerializers = [...(setup.snapshotSerializers ?? [])],
      signal = new AbortController().signal,
      profile = {
        id: 'istanbul-spec-private',
        mode: 'development',
        environment: 'node',
        runtime: 'nodejs',
        bundler: 'turbopack',
      },
      entry = {
        id: row.entryName,
        file: join(fixture, row.entryName),
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
      ...(fault === 'post-file-cleanup' ? { compilerEnvKeys: true } : {}),
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
    assert.equal(artifact.coverage.istanbulHarness, undefined)
    assert.deepEqual(setupFiles, [])
    assert.deepEqual(snapshotSerializers, [])
    writeFileSync(
      join(output, 'NATIVE-HARNESS-ABSENCE.json'),
      JSON.stringify({
        actualZeroConfiguredWrappers: true,
        metadataAbsent: true,
      }) + '\n'
    )
    let rejectedReceipt
    const selectedFault = fault
    let executionEnv = process.env
    if (selectedFault) {
      const preload = join(fixture, 'collection-fault.cjs')
      writeFileSync(
        preload,
        `
const Module=require('node:module')
const originalLoad=Module._load, target=${JSON.stringify(join(artifact.rootDir, artifact.entryPath))}, environmentTarget=${JSON.stringify(join(lib, 'execution/project-env.js'))}, mode=${JSON.stringify(selectedFault)}, getterTrace=${JSON.stringify(join(output, 'ACTUAL-GETTER-TRACE.jsonl'))}
let intercepted=false
Module._load=function(request,parent,isMain){
 const value=Reflect.apply(originalLoad,this,arguments)
 let resolved;try{resolved=Module._resolveFilename(request,parent,isMain)}catch{}
 if(resolved===environmentTarget&&mode==='post-file-cleanup'){
  const replacement=Object.create(value)
  Object.defineProperty(replacement,'applyNodeProjectEnvironment',{value(values){
   const restore=value.applyNodeProjectEnvironment(values)
   return()=>{restore?.();throw new Error('injected independent post-file environment cleanup failure')}
  }})
  return replacement
 }
 if(resolved!==target||intercepted)return value
 intercepted=true
 const runner=Object.create(value.testRunner)
 Object.defineProperty(runner,'initializeTestFile',{value(options){
  const file=value.testRunner.initializeTestFile(options)
  if(mode==='missing-getter')delete file.getCompletedCollectionCoverageFailure
  if(mode==='foreign-getter')file.getCompletedCollectionCoverageFailure=()=>({error:new Error('foreign collection carrier')})
  if(mode==='missing-own-error')file.getCompletedCollectionCoverageFailure=()=>({})
  if(mode==='array-carrier')file.getCompletedCollectionCoverageFailure=()=>[]
  if(mode==='function-carrier')file.getCompletedCollectionCoverageFailure=()=>function(){}
  if(mode==='inherited-error')file.getCompletedCollectionCoverageFailure=()=>Object.create({error:undefined})
  if(mode==='accessor-error')file.getCompletedCollectionCoverageFailure=()=>Object.defineProperty({},'error',{get(){return undefined},enumerable:true})
  if(mode==='post-file-cleanup'){
   const original=file.getCompletedCollectionCoverageFailure
   file.getCompletedCollectionCoverageFailure=function(){const result=Reflect.apply(original,this,arguments);require('node:fs').appendFileSync(getterTrace,JSON.stringify({actualCompletedCollectionCarrier:result!==undefined})+'\\n');return result}
  }
  return file
 }})
 const replacement=Object.create(value)
 Object.defineProperty(replacement,'testRunner',{value:runner})
 return replacement
}
const originalSend=process.send
process.send=function(message,...rest){
 if(message?.type==='event'&&message.event?.type==='diagnostic'&&message.event.coverageFileError&&message.event.diagnostic.phase==='collection'){
  if(mode==='missing-slot')delete message.event.coverageFileError
  if(mode==='duplicate-event')Reflect.apply(originalSend,this,[structuredClone(message),...rest])
 }
 if(message?.type==='complete'&&message.coverage?.complete&&message.coverage.settledFileErrors){
  if(mode==='mismatched-slot')message.coverage.settledFileErrors[0].diagnostic.message='foreign serialized collection diagnostic'
  if(mode==='duplicate-slot')message.coverage.settledFileErrors.push(structuredClone(message.coverage.settledFileErrors[0]))
 }
 return Reflect.apply(originalSend,this,[message,...rest])
}
`
      )
      executionEnv = {
        ...process.env,
        NODE_OPTIONS: [
          process.env.NODE_OPTIONS,
          '--require ' + JSON.stringify(preload),
        ]
          .filter(Boolean)
          .join(' '),
      }
    }
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
        fileTimeout: row.pendingControl ? 3000 : 20000,
        coverage: { version: 1, kind: 'node-istanbul' },
        ...(selectedFault === 'post-file-cleanup'
          ? { env: { NEXT_TEST_COLLECTION_CLEANUP_CONTROL: 'owned' } }
          : {}),
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
      executionEnv
    ).catch((error) => {
      if (!selectedFault) throw error
      rejectedReceipt = { name: error.name, message: error.message }
      return { status: 'failed' }
    })
    writeFileSync(
      join(output, 'OBSERVED.json'),
      JSON.stringify(
        { result, events, captures, fault: selectedFault, rejectedReceipt },
        null,
        2
      ) + '\n'
    )
    const authoredTrace = existsSync(join(fixture, 'authored-trace.jsonl'))
      ? readFileSync(join(fixture, 'authored-trace.jsonl'), 'utf8')
      : ''
    writeFileSync(join(output, 'authored-trace.jsonl'), authoredTrace)
    const traceEvents = (bytes) =>
      bytes
        .split('\n')
        .filter(Boolean)
        .map(JSON.parse)
        .map(({ pid: _pid, ...event }) => event)
    assert.deepEqual(
      traceEvents(authoredTrace),
      traceEvents(row.authoredTrace ?? '')
    )
    assert(!authoredTrace.includes('BODY_MUST_NOT_START'))
    assert.equal(result.status, 'failed')
    assert.equal(
      events.filter((event) => event.type === 'case-start').length,
      0
    )
    assert.equal(events.filter((event) => event.type === 'case-end').length, 0)
    const collection = events.filter(
      (event) =>
        event.type === 'diagnostic' && event.diagnostic.phase === 'collection'
    )
    if (!row.pendingControl)
      assert(
        collection.length > 0,
        'Original collection failure remains reported'
      )
    assert(
      !events.some(
        (event) =>
          event.type === 'diagnostic' &&
          event.diagnostic.name === 'TypeError' &&
          event.diagnostic.message.includes(
            'getCompletedCollectionCoverageFailure'
          )
      )
    )
    if (row.pendingControl) {
      assert.equal(captures.length, 0)
      assert.equal(
        readFileSync(join(fixture, 'pending-load.txt'), 'utf8'),
        'ACTUAL_PENDING_LOAD'
      )
      assert(
        events.some(
          (event) =>
            event.type === 'diagnostic' &&
            event.diagnostic.message ===
              'Test file exceeded its process deadline.'
        )
      )
      for (const [file, bytes] of Object.entries(row.snapshots))
        assert.equal(
          readFileSync(join(fixture, '__snapshots__', file), 'utf8'),
          bytes
        )
      writeFileSync(
        join(output, 'VERIFIED.json'),
        JSON.stringify(
          {
            profile: name,
            actualPendingLoadGate: true,
            actualProcessDeadline: true,
            noInventedCaseEvents: true,
            strictIncompleteCapture: true,
            priorSnapshotsUnchanged: true,
            genuineCompatibilityQualified: false,
          },
          null,
          2
        ) + '\n'
      )
    } else if (row.independentStage || selectedFault) {
      assert.equal(captures.length, 0)
      if (selectedFault === 'post-file-cleanup') {
        const actualGetter = readFileSync(
          join(output, 'ACTUAL-GETTER-TRACE.jsonl'),
          'utf8'
        )
          .trim()
          .split('\n')
          .map(JSON.parse)
        assert(
          actualGetter.some(
            (row) => row.actualCompletedCollectionCarrier === true
          )
        )
        assert(
          events.some(
            (event) =>
              event.type === 'diagnostic' &&
              event.diagnostic.phase === 'cleanup' &&
              event.diagnostic.message ===
                'injected independent post-file environment cleanup failure'
          )
        )
      }
      writeFileSync(
        join(output, 'VERIFIED.json'),
        JSON.stringify(
          {
            profile: name,
            fault: selectedFault,
            independentStage: row.independentStage,
            noInventedCaseEvents: true,
            originalCollectionFailureRetained: true,
            strictIncompleteCapture: true,
            referenceIndependentStagePublicationGapRetained: Boolean(
              row.independentStage
            ),
          },
          null,
          2
        ) + '\n'
      )
    } else {
      assert.equal(collection.length, 1)
      assert.equal(
        collection[0].diagnostic.message,
        row.cases.testResults[0].message
      )
      assert.deepEqual(collection[0].coverageFileError, { index: 0 })
      assert.equal(captures.length, 1)
      assert.equal(
        Object.hasOwn(captures[0].completion, 'settledSuiteErrors'),
        false
      )
      assert.deepEqual(captures[0].completion.settledFileErrors, [
        { index: 0, diagnostic: collection[0].diagnostic },
      ])
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
            actualSoleLoadCarrier: true,
            noInventedCaseEvents: true,
            noFabricatedOperationObservation: true,
            actualMapIndependentOfReportFilePolicy: true,
          },
          null,
          2
        ) + '\n'
      )
    }
    if (!selectedFault && !row.pendingControl) {
      const actual = load(join(artifact.rootDir, artifact.entryPath))
      const imports = actual.initializeModuleImportTracking?.()
      const file = actual.testRunner.initializeTestFile({
        publicTaskSelection: true,
        captureCollectionCoverage: true,
        onUnhandledRejection() {},
        snapshotBodyFailures: true,
        nativeBeforeEachAssertions: true,
        nativeAfterEachAssertions: true,
        nativeBeforeEachCleanupAssertions: true,
        fileId: entry.id,
        filePath: entry.file,
        snapshotUpdateMode: 'none',
        waitForImports: imports?.waitForImports,
      })
      let caught, caughtFailure, disposeError, ownBefore
      let setupCalls = 0,
        specCalls = 0
      try {
        try {
          await file.collect(async () => {
            setupCalls++
            await actual.loadSetupModules('list')
            specCalls++
            await actual.loadTestModule()
          })
        } catch (error) {
          caught = error
          caughtFailure = { error }
          ownBefore =
            error !== null &&
            (typeof error === 'object' || typeof error === 'function')
              ? Object.getOwnPropertyDescriptors(error)
              : undefined
        }
        assert(caughtFailure)
        assert.equal(setupCalls, 1)
        assert.equal(specCalls, 1)
        assert.equal(file.getCompletedCollectionCoverageFailure(), undefined)
        try {
          await file.dispose()
        } catch (error) {
          disposeError = error
        }
        if (ownBefore)
          assert.deepEqual(Object.getOwnPropertyDescriptors(caught), ownBefore)
        else assert.equal(caught, caughtFailure.error)
        assert.equal(file.getOperationSettlement(), undefined)
        assert.equal(file.getNativeBodySettlement(), undefined)
        assert.equal(file.getCompletedCoverageFailures(), undefined)
        const observed = file.getCompletedCollectionCoverageFailure()
        if (row.independentStage) {
          assert.equal(observed, undefined)
          const leaves = (error, ancestors = new Set()) => {
            if (!error || ancestors.has(error) || !Array.isArray(error.errors))
              return [error]
            const next = new Set(ancestors).add(error)
            return error.errors.flatMap((error) => leaves(error, next))
          }
          if (row.independentStage === 'disposal')
            assert(
              leaves(disposeError).includes(caught),
              'same actual load Error must occur in independent disposal'
            )
          else {
            const actual = leaves(caught)
            assert(
              actual.some((error, index) => actual.indexOf(error) !== index),
              'same original Error must occupy distinct load/collector-settle occurrences'
            )
          }
        } else {
          assert.equal(disposeError, undefined)
          assert(observed)
          assert(Object.isFrozen(observed))
          assert.equal(observed.error, caught)
        }
        writeFileSync(
          join(output, 'ACTUAL-COLLECTION-FACTS.json'),
          JSON.stringify(
            {
              setupCalls,
              specCalls,
              fileRunCalled: false,
              operationObservationAbsent:
                file.getOperationSettlement() === undefined,
              nativeBodyObservationAbsent:
                file.getNativeBodySettlement() === undefined,
              actualSoleLoadCarrier:
                observed !== undefined && observed.error === caught,
              actualErrorOwnFieldsUnchanged: true,
              sameErrorIndependentStagesProven: Boolean(row.independentStage),
              collectionError: {
                name: caught?.name,
                message: caught?.message,
                primitiveUndefined: caught === undefined,
              },
              disposalError: disposeError
                ? { name: disposeError.name, message: disposeError.message }
                : undefined,
            },
            null,
            2
          ) + '\n'
        )
      } finally {
        await file.dispose()
        await imports?.dispose()
      }
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
