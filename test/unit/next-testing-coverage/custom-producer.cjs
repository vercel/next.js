// Controlled compiler producer; the supervisor, broker, executor and file child are real.
const fs = require('node:fs')
const path = require('node:path')
let broker
const controller = new AbortController()
let allocation
const send = (message) =>
  new Promise((resolve, reject) =>
    process.send(message, (error) => (error ? reject(error) : resolve()))
  )
process.on('message', (message) => {
  if (broker?.handle(message)) return
  if (message.type === 'cancel') {
    controller.abort(new Error('custom producer cancellation'))
    return
  }
  if (message.type === 'artifact-allocation-response') {
    allocation(message.allocation)
    return
  }
  if (message.type !== 'start') return
  void (async () => {
    const request = message.request
    const f = JSON.parse(
      fs.readFileSync(
        path.join(request.projectDir, 'producer-input.json'),
        'utf8'
      )
    )
    broker = require(
      f.runtime + '/execution/broker'
    ).createExecutionBrokerClient({ allowCoverage: true, send })
    const owned = await new Promise((resolve) => {
      allocation = resolve
      void send({
        type: 'artifact-allocation-request',
        id: 'custom-owned',
        parentDir: path.join(request.projectDir, 'allocations'),
      })
    })
    fs.mkdirSync(owned.rootDir, { recursive: true })
    for (const name of f.artifact.files)
      fs.copyFileSync(
        path.join(f.artifact.rootDir, name),
        path.join(owned.rootDir, name)
      )
    if (f.mode.startsWith('snapshot-')) {
      // The compiler alone is controlled; normal snapshot normalization,
      // orchestration, broker ownership and the actual file child remain real.
      const compiler = require.resolve(f.runtime + '/compiler/index')
      require.cache[compiler] = {
        id: compiler,
        filename: compiler,
        loaded: true,
        exports: {
          async createTestCompilerSession() {
            return {
              async compile() {
                return { ...f.artifact, rootDir: owned.rootDir }
              },
              async dispose() {},
            }
          },
        },
      }
      const { runTests } = require(f.runtime + '/orchestrator')
      const result = await runTests(request.projectDir, request.projects, {
        ...request,
        signal: controller.signal,
        write() {},
        execute: broker.execute,
        onEvent(event) {
          void send({ type: 'event', event })
        },
      })
      await send({ type: 'result', value: { operation: 'run', result } })
      process.disconnect()
      return
    }
    const runId = 'custom-supervisor',
      envelope = () => ({ version: 1, runId, timestamp: Date.now() })
    await send({ type: 'event', event: { ...envelope(), type: 'run-start' } })
    const facts = []
    const result = await broker.execute(
      { ...f.artifact, rootDir: owned.rootDir },
      {
        runId,
        projectDir: request.projectDir,
        entry: f.entry,
        setupFiles: [],
        snapshotUpdateMode: 'none',
        signal: controller.signal,
        testTimeout: 2000,
        hookTimeout: 1000,
        fileTimeout: 5000,
        customCoverage: request.customCoverageRequests[f.entry.profile.id],
        onEvent(event) {
          void send({ type: 'event', event })
        },
        async onCustomCoverage(completion) {
          facts.push({
            completion,
            testFiles: ['contract.case.mjs'],
            environment: 'ssr',
          })
        },
      }
    )
    if (f.mode === 'mismatched-facts') facts[0].completion.revision = 'wrong'
    if (f.mode === 'missing-facts') facts.pop()
    await send({
      type: 'event',
      event: {
        ...envelope(),
        type: 'run-end',
        status: result.status,
        durationMs: 1,
      },
    })
    await send({
      type: 'result',
      value: {
        operation: 'run',
        result: {
          status: result.status,
          unsafeCleanup: f.mode === 'unsafe-cleanup',
          customCoverage: facts,
        },
      },
    })
    process.disconnect()
  })().catch((error) => {
    console.error(error)
    process.exitCode = 1
    process.disconnect?.()
  })
})
