const assert = require('node:assert/strict')
const path = require('node:path')
const { createRequire } = require('node:module')

async function run(load, mode) {
  const {
    isSharedRscWatchRun,
    isSharedRscCohortProject,
    expandSharedRscCohortSelection,
  } = load('next/dist/experimental/testing/incremental/shared-rsc-cohort')
  const profile = {
    id: 'shared-rsc',
    environment: 'rsc',
    mode: 'development',
    runtime: 'nodejs',
    bundler: 'turbopack',
    route: '/shared/[id]',
  }
  const project = {
    profile,
    isolate: false,
    include: [],
    exclude: [],
    setupFiles: [],
    testTimeout: 1000,
    hookTimeout: 1000,
    fileTimeout: 10000,
    entries: ['first', 'second'].map((id) => ({
      id,
      file: '/project/' + id + '.mjs',
      profile,
    })),
  }
  const request = {
    operation: 'run',
    projectDir: '/project',
    projects: [project],
    maxWorkers: 1,
    snapshotUpdateMode: 'none',
  }
  let checks = 0
  if (mode === 'scope') {
    assert(isSharedRscCohortProject(project))
    assert(isSharedRscWatchRun(request))
    checks += 2
    for (const flag of [
      'collectOnly',
      'inspectBrk',
      'coverage',
      'watchCoverage',
      'userCancellation',
      'updateSnapshots',
      'captureJUnitSuiteTasks',
      'captureOneShotV8CollectionRestoration',
      'preparePublicSnapshots',
      'captureOneShotV8ReadOnlySnapshots',
      'captureModuleStart',
      'captureModuleQueued',
      'captureModuleCollected',
    ]) {
      assert(!isSharedRscWatchRun({ ...request, [flag]: true }))
      checks++
    }
    for (const change of [
      { inspect: '127.0.0.1:9229' },
      { standardCoverageOptions: {} },
      { customCoverageRequests: {} },
      { compilerTransforms: {} },
      { maxWorkers: 2 },
      { isolatedProfile: true },
      { projects: [] },
      { projects: [project, project] },
      { snapshotUpdateMode: 'all' },
    ]) {
      assert(!isSharedRscWatchRun({ ...request, ...change }))
      checks++
    }
    const invalid = [
      (value) => {
        value.isolate = true
      },
      (value) => {
        value.profile.environment = 'node'
      },
      (value) => {
        value.profile.mode = 'production'
      },
      (value) => {
        value.profile.runtime = 'edge'
      },
      (value) => {
        value.profile.bundler = 'webpack'
      },
      (value) => {
        delete value.profile.route
      },
      (value) => {
        value.setupFiles = ['/project/setup.mjs']
      },
      (value) => {
        value.snapshotSerializers = ['/project/serializer.cjs']
      },
      (value) => {
        value.globalSetup = ['/project/global.mjs']
      },
      (value) => {
        value.bail = 1
      },
      (value) => {
        value.typecheck = { enabled: true }
      },
      (value) => {
        value.executionEnvironment = { name: 'jsdom', options: {} }
      },
      (value) => {
        value.entries[1].profile = { ...value.profile, route: '/foreign' }
      },
      (value) => {
        value.entries[1].inSource = true
      },
    ]
    for (const mutate of invalid) {
      const value = structuredClone(project)
      mutate(value)
      assert(!isSharedRscCohortProject(value))
      checks++
    }
    assert(!isSharedRscWatchRun({ operation: 'plan', projects: [project] }))
    checks++
  } else if (mode === 'selection') {
    const isolated = {
      ...project,
      isolate: true,
      entries: [{ id: 'isolated', file: '/project/isolated.mjs', profile }],
    }
    const selected = new Set(['second', 'isolated'])
    const expanded = expandSharedRscCohortSelection(
      [project, isolated],
      selected
    )
    assert.deepEqual([...selected], ['second', 'isolated'])
    assert.deepEqual(
      project.entries
        .filter((entry) => expanded.has(entry.id))
        .map((entry) => entry.id),
      ['first', 'second']
    )
    assert(expanded.has('isolated'))
    assert.deepEqual(
      [...expandSharedRscCohortSelection([project], new Set())],
      []
    )
    assert.deepEqual(
      [...expandSharedRscCohortSelection([isolated], new Set(['first']))],
      ['first']
    )
    checks += 5
  } else if (mode === 'join') {
    const { createWatchSession } = load(
      'next/dist/experimental/testing/incremental/watch-session'
    )
    const deferred = () => {
      let resolve
      const promise = new Promise((done) => {
        resolve = done
      })
      return { promise, resolve }
    }
    const started = deferred(),
      aborted = deferred(),
      release = deferred(),
      trace = []
    const session = createWatchSession({
      async discover() {
        return {
          entryIds: ['first', 'second'],
          discoveryRevision: 'same-actual-registry',
        }
      },
      async run({ generation, signal, selection }) {
        const expanded = expandSharedRscCohortSelection(
          [project],
          new Set(selection.entryIds)
        )
        assert.deepEqual(
          project.entries
            .filter((value) => expanded.has(value.id))
            .map((value) => value.id),
          ['first', 'second']
        )
        trace.push('start:' + generation)
        if (generation === 1) {
          signal.addEventListener(
            'abort',
            () => {
              trace.push('abort:1')
              aborted.resolve()
            },
            { once: true }
          )
          started.resolve()
          await aborted.promise
          await release.promise
          trace.push('joined:1')
          return { status: 'cancelled' }
        }
        trace.push('joined:' + generation)
        return { status: 'passed' }
      },
      onError(error) {
        throw error
      },
    })
    try {
      await started.promise
      session.invalidate({ registryPaths: ['/project/shared-state.mjs'] })
      await aborted.promise
      assert.deepEqual(trace, ['start:1', 'abort:1'])
      release.resolve()
      await session.waitForIdle()
      assert.deepEqual(trace, [
        'start:1',
        'abort:1',
        'joined:1',
        'start:2',
        'joined:2',
      ])
      checks += 2
    } finally {
      release.resolve()
      await session.close()
    }
  } else throw new Error('Unknown shared RSC watch contract mode')
  return {
    mode,
    checks,
    pureContractOnly: true,
    actualWatchAdmissionOpen: false,
    actualNativeWatchQualified: false,
  }
}
module.exports = { run }
if (require.main === module)
  run(
    createRequire(path.join(path.resolve(process.argv[2]), 'package.json')),
    process.argv[3]
  )
    .then((value) => console.log(JSON.stringify(value)))
    .catch((error) => {
      console.error(error)
      process.exitCode = 1
    })
