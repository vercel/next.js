import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createHash, randomUUID } from 'node:crypto'
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  existsSync,
} from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
const [consumerArg, outputArg, phase] = process.argv.slice(2)
const fault = process.argv
  .find((arg) => arg.startsWith('--fault='))
  ?.slice('--fault='.length)
const consumer = resolve(consumerArg),
  output = resolve(outputArg)
mkdirSync(output, { recursive: true })
if (phase !== 'child') {
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
  assertOwnedNodeCompleted(owner, 'actual private V8 restoration')
  assert.equal(owner.status, 0, owner.stderr)
} else {
  const load = createRequire(join(consumer, 'package.json')),
    nextRoot = dirname(load.resolve('next/package.json')),
    lib = join(nextRoot, 'dist/experimental/testing')
  const row = JSON.parse(
    readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        fault === 'pending-load'
          ? 'fixtures/istanbul-provider/v8-collection-pristine.json'
          : 'fixtures/istanbul-provider/v8-restoration-pristine.json'
      )
    )
  ).rows.find(
    (row) =>
      row.name ===
      (fault === 'pending-load'
        ? 'setup-import-pending-control'
        : 'setup-import-mixed-disposal')
  )
  const fixture = mkdtempSync(join(consumer, '.next-v8-restoration-private-'))
  const events = [],
    captures = [],
    controller = new AbortController(),
    signal = controller.signal,
    parentAbortReason = new Error(
      'actual parent cancellation after restoration diagnostic'
    )
  let session, direct, imports
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
    const setup = JSON.parse(row.config.slice('export default '.length)).test
    const setupFiles = setup.setupFiles.map((file) => resolve(fixture, file)),
      snapshotSerializers = setup.snapshotSerializers
    const profile = {
      id: 'restoration-private',
      mode: 'development',
      environment: 'node',
      runtime: 'nodejs',
      bundler: 'turbopack',
    }
    const entry = {
      id: row.entryName,
      file: join(fixture, row.entryName),
      profile,
    }
    process.chdir(fixture)
    session = await load(lib + '/compiler').createTestCompilerSession(
      fixture,
      profile
    )
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
    const coverageOptions = {
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
      coverage: { version: 1, kind: 'node-line' },
      ...(fault === 'unrequested'
        ? {}
        : { captureOneShotV8CollectionRestoration: true }),
      onEvent(event) {
        events.push(event)
        if (
          fault === 'parent-abort' &&
          event.type === 'diagnostic' &&
          event.coverageFileError?.index === 1 &&
          event.diagnostic.phase === 'cleanup'
        )
          controller.abort(parentAbortReason)
      },
      onCoverage: async (completion) => {
        captures.push(completion)
      },
    }
    const eligibility = load(lib + '/execution/coverage')
    const eligible = eligibility.captureNodeV8CollectionRestorationCoverage(
      artifact,
      coverageOptions
    )
    let executionEnv = process.env
    if (
      fault &&
      !['unrequested', 'pending-load', 'parent-abort'].includes(fault)
    ) {
      const preload = join(fixture, 'restoration-fault.cjs')
      writeFileSync(
        preload,
        `
const Module=require('node:module')
const original=Module._load,target=${JSON.stringify(join(artifact.rootDir, artifact.entryPath))},projectEnvironment=${JSON.stringify(join(lib, 'execution/project-env.js'))},mode=${JSON.stringify(fault)}
Module._load=function(request,parent,isMain){
 const value=Reflect.apply(original,this,arguments)
 let resolved;try{resolved=Module._resolveFilename(request,parent,isMain)}catch{}
 if(mode==='post-file-cleanup'&&resolved===projectEnvironment){
  const replacement=Object.create(value)
  Object.defineProperty(replacement,'applyNodeProjectEnvironment',{value(values){const restore=value.applyNodeProjectEnvironment(values);return()=>{restore?.();throw new Error('independent post-restoration environment cleanup failure')}}})
  return replacement
 }
 if(resolved!==target)return value
 const runner=Object.create(value.testRunner)
 Object.defineProperty(runner,'initializeTestFile',{value(options){const file=value.testRunner.initializeTestFile(options)
  if(mode==='missing-getter')delete file.getCompletedCollectionRestorationFailure
  if(mode==='mismatched-pair')file.getCompletedCollectionRestorationFailure=()=>Object.freeze({collectionError:{},disposalError:{}})
  return file
 }})
 const replacement=Object.create(value);Object.defineProperty(replacement,'testRunner',{value:runner});return replacement
}
const send=process.send
process.send=function(message,...args){
 if(message?.type==='complete'&&message.coverage?.complete&&message.coverage.settledFileErrors){
  if(mode==='duplicate-slot')message.coverage.settledFileErrors.push(structuredClone(message.coverage.settledFileErrors[1]))
  if(mode==='mismatched-slot')message.coverage.settledFileErrors[1].diagnostic.message='foreign restoration occurrence'
 }
 return Reflect.apply(send,this,[message,...args])
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
    let result, rejected
    try {
      result = await load(lib + '/execution/execute').executeWithEnvironment(
        artifact,
        coverageOptions,
        executionEnv
      )
    } catch (error) {
      rejected = { name: error.name, message: error.message }
    }
    writeFileSync(
      join(output, 'OBSERVED.json'),
      JSON.stringify(
        { eligible, result, rejected, events, captures },
        null,
        2
      ) + '\n'
    )
    if (fault) {
      assert.equal(eligible, fault !== 'unrequested')
      assert.equal(captures.length, 0)
      if (fault === 'pending-load') {
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
      } else {
        assert(
          events.some(
            (event) =>
              event.type === 'diagnostic' &&
              event.diagnostic.phase === 'collection' &&
              event.diagnostic.message ===
                'same actual load and disposal failure'
          )
        )
        assert(
          events.some(
            (event) =>
              event.type === 'diagnostic' &&
              event.diagnostic.phase === 'cleanup'
          )
        )
      }
      if (fault === 'parent-abort') {
        assert.equal(signal.aborted, true)
        assert.equal(signal.reason, parentAbortReason)
      }
      for (const [file, bytes] of Object.entries(row.snapshots))
        assert.equal(
          readFileSync(join(fixture, '__snapshots__', file), 'utf8'),
          bytes
        )
      assert(
        !events.some(
          (event) => event.type === 'case-start' || event.type === 'case-end'
        )
      )
      writeFileSync(
        join(output, 'VERIFIED.json'),
        JSON.stringify(
          {
            fault,
            actualOriginalFailuresRetained: fault !== 'pending-load',
            actualPendingLoadGate: fault === 'pending-load',
            actualProcessDeadline: fault === 'pending-load',
            actualParentAbortIdentity: fault === 'parent-abort',
            priorSnapshotsUnchanged: true,
            strictIncompleteCapture: true,
            noInventedBodyOrOperation: true,
            allOwnersJoined: true,
          },
          null,
          2
        ) + '\n'
      )
    } else {
      const actual = load(join(artifact.rootDir, artifact.entryPath))
      imports = actual.initializeModuleImportTracking?.()
      direct = actual.testRunner.initializeTestFile({
        publicTaskSelection: true,
        captureCollectionCoverage: true,
        captureCollectionRestoration: true,
        captureSettledCollectionDeclarations: true,
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
      let loadError,
        loadThrew = false,
        disposeError,
        disposeThrew = false
      try {
        await direct.collect(async () => {
          await actual.loadSetupModules('list')
          await actual.loadTestModule()
        })
      } catch (error) {
        loadError = error
        loadThrew = true
      }
      try {
        await direct.dispose()
      } catch (error) {
        disposeError = error
        disposeThrew = true
      }
      const pair = direct.getCompletedCollectionRestorationFailure?.()
      writeFileSync(
        join(output, 'ACTUAL-FILE-FACTS.json'),
        JSON.stringify(
          {
            loadThrew,
            disposeThrew,
            loadError: { name: loadError?.name, message: loadError?.message },
            disposalError: {
              name: disposeError?.name,
              message: disposeError?.message,
            },
            pairPresent: pair !== undefined,
            exactLoad: pair?.collectionError === loadError,
            exactDisposal: pair?.disposalError === disposeError,
            operationAbsent: direct.getOperationSettlement() === undefined,
            nativeBodyAbsent: direct.getNativeBodySettlement() === undefined,
            ordinaryCompletionAbsent:
              direct.getCompletedCollectionCoverageFailure() === undefined,
          },
          null,
          2
        ) + '\n'
      )
      assert(eligible)
      assert.equal(rejected, undefined)
      assert.equal(result.status, 'failed')
      assert.equal(captures.length, 1)
      assert.equal(captures[0].complete, true)
      assert.deepEqual(
        captures[0].settledFileErrors.map((value) => value.index),
        [0, 1]
      )
      assert.equal(
        events.filter(
          (event) => event.type === 'case-start' || event.type === 'case-end'
        ).length,
        0
      )
      assert(loadThrew && disposeThrew && pair)
      assert.equal(pair.collectionError, loadError)
      assert.equal(pair.disposalError, disposeError)
      assert.equal(direct.getOperationSettlement(), undefined)
      assert.equal(direct.getNativeBodySettlement(), undefined)
      writeFileSync(
        join(output, 'VERIFIED.json'),
        JSON.stringify(
          {
            actualCompiledRestorationPair: true,
            originalDisposeThrows: true,
            originalTwoDiagnosticSlots: true,
            noInventedBodyOrOperation: true,
            actualCoverageCapture: true,
            allOwnersJoined: true,
          },
          null,
          2
        ) + '\n'
      )
    }
  } finally {
    await direct?.dispose()
    await imports?.dispose()
    await session?.dispose()
    rmSync(fixture, { recursive: true, force: true })
    writeFileSync(
      join(output, 'CLOSED.json'),
      JSON.stringify({
        compilerDisposed: Boolean(session),
        fixtureRetired: !existsSync(fixture),
      }) + '\n'
    )
  }
}
