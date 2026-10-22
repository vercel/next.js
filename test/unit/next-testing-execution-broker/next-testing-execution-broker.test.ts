import {
  createExecutionBrokerClient,
  createExecutionBrokerHost,
  type ExecutionBrokerRequest,
  type ExecutionBrokerResponse,
} from 'next/dist/experimental/testing/execution/broker'
import type {
  CompiledTestArtifact,
  CompiledTestCohort,
  ExecuteTestOptions,
} from 'next/dist/experimental/testing/contracts'
import { executeCohortWithEnvironment } from 'next/dist/experimental/testing/execution/execute-cohort'

jest.mock('next/dist/experimental/testing/execution/execute-cohort', () => ({
  ...jest.requireActual(
    'next/dist/experimental/testing/execution/execute-cohort'
  ),
  executeCohortWithEnvironment: jest.fn(),
}))

import { promises as fs } from 'fs'
import { basename } from 'path'

jest.mock('next/dist/experimental/testing/browser/server', () => ({
  __esModule: true,
  ...jest.requireActual('next/dist/experimental/testing/browser/server'),
}))

jest.mock('next/dist/experimental/testing/browser/host', () => ({
  __esModule: true,
  ...jest.requireActual('next/dist/experimental/testing/browser/host'),
}))

jest.mock('next/dist/experimental/testing/execution/execute', () => ({
  __esModule: true,
  ...jest.requireActual('next/dist/experimental/testing/execution/execute'),
}))

const profile = {
  id: 'unit',
  mode: 'development' as const,
  environment: 'node' as const,
  runtime: 'nodejs' as const,
  bundler: 'turbopack' as const,
}
const entry = { id: 'unit:file', file: '/project/file.ts', profile }
const artifact: CompiledTestArtifact = {
  version: 2,
  kind: 'node',
  entryId: entry.id,
  profile,
  revision: 'revision',
  rootDir: '/project/artifact',
  entryPath: 'entry.js',
  files: ['entry.js'],
  diagnostics: [],
}
const options: ExecuteTestOptions = {
  runId: 'run',
  projectDir: '/project',
  entry,
  setupFiles: [],
  testTimeout: 1000,
  hookTimeout: 1000,
  fileTimeout: 1000,
  signal: new AbortController().signal,
  onEvent() {},
}
const result = { entryId: entry.id, status: 'passed' as const, durationMs: 1 }
const event = {
  type: 'run-start' as const,
  version: 1 as const,
  runId: 'run',
  timestamp: 1,
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function transport(allowCoverage = false, allowCohorts = false) {
  const sent: ExecutionBrokerRequest[] = []
  const launched = deferred<ExecutionBrokerRequest>()
  const cancelled = deferred<void>()
  const client = createExecutionBrokerClient({
    allowCoverage,
    allowCohorts,
    async send(message) {
      sent.push(message)
      if (message.action === 'execute' || message.action === 'execute-cohort')
        launched.resolve(message)
      else cancelled.resolve()
    },
  })
  return {
    sent,
    launched: launched.promise,
    cancelled: cancelled.promise,
    client,
  }
}

it('awaits one-shot coverage processing before releasing the artifact on a terminal result', async () => {
  const channel = transport(true)
  const processing = deferred<void>()
  const received = deferred<void>()
  let settled = false
  const completion = channel.client.execute(artifact, {
    ...options,
    coverage: { version: 1, kind: 'node-line' },
    async onCoverage(value) {
      expect(value.entryId).toBe(entry.id)
      received.resolve()
      await processing.promise
    },
  })
  void completion.then(() => {
    settled = true
  })
  const request = await channel.launched
  if (request.action !== 'execute') throw new Error('Expected execution')
  expect(request.options).not.toHaveProperty('onCoverage')
  channel.client.handle({
    type: 'execution-broker-response',
    action: 'coverage',
    id: request.id,
    completion: {
      version: 1,
      runId: 'run',
      entryId: entry.id,
      revision: 'revision',
      complete: false,
      error: { phase: 'runtime', severity: 'error', message: 'incomplete' },
    },
  })
  channel.client.handle({
    type: 'execution-broker-response',
    action: 'result',
    id: request.id,
    result,
  })
  await received.promise
  expect(settled).toBe(false)
  processing.resolve()
  expect(await completion).toEqual(result)
})

it('fails a file when coverage processing rejects instead of accepting a passing worker result', async () => {
  const channel = transport(true)
  const failure = new Error('invalid coverage identity')
  const completion = channel.client.execute(artifact, {
    ...options,
    coverage: { version: 1, kind: 'node-line' },
    async onCoverage() {
      throw failure
    },
  })
  const rejected = completion.catch((error) => error)
  const request = await channel.launched
  channel.client.handle({
    type: 'execution-broker-response',
    action: 'coverage',
    id: request.id,
    completion: { version: 1 },
  })
  await channel.cancelled
  channel.client.handle({
    type: 'execution-broker-response',
    action: 'result',
    id: request.id,
    result,
  })
  expect(await rejected).toBe(failure)
})

it('sends the compiler environment privately and delivers ordered events/result', async () => {
  const channel = transport()
  const observed = jest.fn()
  const previous = process.env.NEXT_TEST_BROKER_ENV_PROBE
  process.env.NEXT_TEST_BROKER_ENV_PROBE = 'fresh-generation'
  try {
    const completion = channel.client.execute(artifact, {
      ...options,
      onEvent: observed,
    })
    const request = await channel.launched
    expect(request.action).toBe('execute')
    if (request.action !== 'execute') throw new Error('Expected launch request')
    expect(request.env.NEXT_TEST_BROKER_ENV_PROBE).toBe('fresh-generation')
    expect(request.env).not.toBe(process.env)
    expect(request.options).not.toHaveProperty('signal')
    expect(request.options).not.toHaveProperty('onEvent')
    expect(channel.client.handle({ type: 'other' })).toBe(false)
    channel.client.handle({
      type: 'execution-broker-response',
      action: 'event',
      id: request.id,
      event,
    })
    channel.client.handle({
      type: 'execution-broker-response',
      action: 'result',
      id: request.id,
      result,
    })
    expect(await completion).toEqual(result)
    expect(observed).toHaveBeenCalledWith(event)
  } finally {
    if (previous === undefined) delete process.env.NEXT_TEST_BROKER_ENV_PROBE
    else process.env.NEXT_TEST_BROKER_ENV_PROBE = previous
  }
})

it('does not release an artifact on cancellation before host completion', async () => {
  const channel = transport()
  const controller = new AbortController()
  let settled = false
  const completion = channel.client.execute(artifact, {
    ...options,
    signal: controller.signal,
  })
  void completion.then(() => {
    settled = true
  })
  const request = await channel.launched
  controller.abort()
  await channel.cancelled
  expect(settled).toBe(false)
  channel.client.handle({
    type: 'execution-broker-response',
    action: 'result',
    id: request.id,
    result: { ...result, status: 'cancelled' },
  })
  expect((await completion).status).toBe('cancelled')
  expect(channel.sent.map((message) => message.action)).toEqual([
    'execute',
    'cancel',
  ])
})

it('orders an already-aborted launch before its cancellation', async () => {
  const channel = transport()
  const completion = channel.client.execute(artifact, {
    ...options,
    signal: AbortSignal.abort(),
  })
  const request = await channel.launched
  await channel.cancelled
  expect(channel.sent.map((message) => message.action)).toEqual([
    'execute',
    'cancel',
  ])
  channel.client.handle({
    type: 'execution-broker-response',
    action: 'result',
    id: request.id,
    result: { ...result, status: 'cancelled' },
  })
  await completion
})

it('retains reporter failure while awaiting authoritative cleanup', async () => {
  const channel = transport()
  const failure = new Error('reporter failed')
  const completion = channel.client.execute(artifact, {
    ...options,
    onEvent() {
      throw failure
    },
  })
  const rejected = completion.catch((error) => error)
  const request = await channel.launched
  channel.client.handle({
    type: 'execution-broker-response',
    action: 'event',
    id: request.id,
    event,
  })
  await channel.cancelled
  expect(channel.sent.map((message) => message.action)).toEqual([
    'execute',
    'cancel',
  ])
  channel.client.handle({
    type: 'execution-broker-response',
    action: 'result',
    id: request.id,
    result,
  })
  expect(await rejected).toBe(failure)
})

it('preserves remote cleanup causes and closes pending calls on disconnect', async () => {
  const channel = transport()
  const first = channel.client.execute(artifact, options)
  const rejected = first.catch((error) => error)
  const request = await channel.launched
  channel.client.handle({
    type: 'execution-broker-response',
    action: 'error',
    id: request.id,
    error: {
      phase: 'cleanup',
      severity: 'error',
      message: 'cleanup',
      cause: { phase: 'cleanup', severity: 'error', message: 'inner' },
    },
  })
  expect(await rejected).toMatchObject({
    message: 'cleanup',
    cause: { message: 'inner' },
  })
  const second = channel.client.execute(artifact, options)
  const failure = new Error('parent disconnected')
  const disconnected = second.catch((error) => error)
  channel.client.disconnect(failure)
  expect(await disconnected).toBe(failure)
  await expect(channel.client.execute(artifact, options)).rejects.toBe(failure)
})

it('does not let a stuck compiler IPC send prevent broker closure', async () => {
  const sending = deferred<void>()
  const never = new Promise<void>(() => {})
  const host = createExecutionBrokerHost({
    signal: new AbortController().signal,
    send() {
      sending.resolve()
      return never
    },
  })
  host.handle({
    type: 'execution-broker-request',
    id: 'one',
    action: 'execute',
    artifact,
    options: { ...options, updateSnapshots: true },
    env: { ...process.env },
  })
  await sending.promise
  const closing = host.close()
  expect(host.close()).toBe(closing)
  await closing
})

it('rejects duplicate requests and unsupported watch capabilities explicitly', async () => {
  const received: ExecutionBrokerResponse[] = []
  const delivered = deferred<void>()
  const host = createExecutionBrokerHost({
    signal: new AbortController().signal,
    async send(message) {
      received.push(message)
      delivered.resolve()
    },
  })
  const request = {
    type: 'execution-broker-request',
    id: 'one',
    action: 'execute',
    artifact,
    options: { ...options, updateSnapshots: true },
    env: { ...process.env },
  }
  expect(host.handle({ type: 'other' })).toBe(false)
  expect(host.handle(request)).toBe(true)
  expect(() => host.handle(request)).toThrow('Duplicate')
  await delivered.promise
  await host.close()
  expect(received).toEqual([
    expect.objectContaining({
      action: 'error',
      error: expect.objectContaining({
        message: expect.stringContaining('snapshot updates are unavailable'),
      }),
    }),
  ])
  expect(() => host.handle({ ...request, id: 'two' })).toThrow('closed')
})

it('retains a rejected send when closure starts as its response is delivered', async () => {
  const delivered = deferred<void>()
  const failure = new Error('terminal transport failed')
  const host = createExecutionBrokerHost({
    signal: new AbortController().signal,
    async send() {
      delivered.resolve()
      throw failure
    },
  })
  host.handle({
    type: 'execution-broker-request',
    id: 'one',
    action: 'execute',
    artifact,
    options: { ...options, updateSnapshots: true },
    env: { ...process.env },
  })
  await delivered.promise
  await expect(host.close()).rejects.toBe(failure)
})

it('observes event-send rejection while waiting for actual execution cleanup', async () => {
  const delivered = deferred<void>()
  const failure = new Error('event transport failed')
  const host = createExecutionBrokerHost({
    // This takes B's real cancelled-before-fork path and file-cache lease.
    signal: AbortSignal.abort(),
    async send(message) {
      if (message.action !== 'event') throw new Error('Expected event response')
      delivered.resolve()
      throw failure
    },
  })
  host.handle({
    type: 'execution-broker-request',
    id: 'one',
    action: 'execute',
    artifact,
    options,
    env: { ...process.env },
  })
  await delivered.promise
  expect(host.ownershipClosed).toBe(false)
  await expect(host.close()).rejects.toBe(failure)
  expect(host.ownershipClosed).toBe(true)
})

it('does not launch new work after a synchronous disconnect', async () => {
  const channel = transport()
  const failure = new Error('disconnected before launch')
  const completion = channel.client
    .execute(artifact, options)
    .catch((error) => error)
  channel.client.disconnect(failure)
  expect(await completion).toBe(failure)
  expect(channel.sent).toEqual([])
})

it.each([false, true])(
  'does not certify ownership after cache cleanup rejects (transport failure: %s)',
  async (failTransport) => {
    const cleanupFailure = new Error('injected file cache cleanup failure')
    const transportFailure = new Error('injected cleanup response failure')
    const delivered = deferred<void>()
    const remove = fs.rm.bind(fs)
    let directory: string | undefined
    const spy = jest
      .spyOn(fs, 'rm')
      .mockImplementation(async (path, options) => {
        if (
          typeof path === 'string' &&
          basename(path).startsWith('next-test-cache-')
        ) {
          directory = path
          throw cleanupFailure
        }
        return remove(path, options)
      })
    const host = createExecutionBrokerHost({
      signal: AbortSignal.abort(),
      async send(message) {
        if (message.action === 'error') {
          delivered.resolve()
          if (failTransport) throw transportFailure
        }
      },
    })
    try {
      host.handle({
        type: 'execution-broker-request',
        id: 'one',
        action: 'execute',
        artifact,
        options,
        env: { ...process.env },
      })
      await delivered.promise
      const error = await host.close().catch((failure) => failure)
      if (failTransport) {
        expect(error).toBeInstanceOf(AggregateError)
        expect(error.errors).toEqual([cleanupFailure, transportFailure])
      } else {
        expect(error).toBe(cleanupFailure)
      }
      expect(host.ownershipClosed).toBe(false)
      expect(directory).toBeDefined()
    } finally {
      spy.mockRestore()
      if (directory) await remove(directory, { recursive: true, force: true })
    }
  }
)

describe('shared cohort broker', () => {
  const secondEntry = {
    ...entry,
    id: 'unit:second',
    file: '/project/second.ts',
  }
  const cohort: CompiledTestCohort = {
    version: 1,
    artifacts: [
      { ...artifact, kind: 'node' },
      { ...artifact, kind: 'node', entryId: secondEntry.id },
    ],
  }
  const executionOptions = (): ExecuteTestOptions[] => [
    options,
    { ...options, entry: secondEntry },
  ]
  const results = [result, { ...result, entryId: secondEntry.id }]
  const request = (
    id: string,
    extra: Partial<ExecuteTestOptions> = {}
  ): ExecutionBrokerRequest => ({
    type: 'execution-broker-request',
    action: 'execute-cohort',
    id,
    cohort,
    options: executionOptions().map((value) => ({ ...value, ...extra })),
    env: { ...process.env },
  })
  afterEach(() => {
    jest.mocked(executeCohortWithEnvironment).mockReset()
  })

  it('sends one aggregate private request with every callback stripped and per-file event dispatch', async () => {
    const channel = transport(false, true)
    const first = jest.fn(),
      second = jest.fn()
    const completion = channel.client.executeCohort(cohort, [
      { ...options, onEvent: first, onSnapshotUpdates: async () => {} },
      {
        ...options,
        entry: secondEntry,
        onEvent: second,
        onSnapshotUpdates: async () => {},
      },
    ])
    const launched = await channel.launched
    if (launched.action !== 'execute-cohort')
      throw new Error('Expected aggregate request')
    expect(launched.cohort).toBe(cohort)
    expect(launched.env).not.toBe(process.env)
    expect(() => structuredClone(launched)).not.toThrow()
    for (const value of launched.options)
      for (const name of [
        'signal',
        'onEvent',
        'onCoverage',
        'onSnapshotUpdates',
      ])
        expect(value).not.toHaveProperty(name)
    const observed = {
      ...event,
      type: 'file-start' as const,
      entry: secondEntry,
      revision: 'revision',
    }
    channel.client.handle({
      type: 'execution-broker-response',
      action: 'event',
      id: launched.id,
      event: observed,
    })
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith(observed)
    channel.client.handle({
      type: 'execution-broker-response',
      action: 'cohort-result',
      id: launched.id,
      results,
    })
    expect(await completion).toEqual(results)
    expect(channel.sent.map((value) => value.action)).toEqual([
      'execute-cohort',
    ])
  })

  it('strips a single-file snapshot callback before serialization too', async () => {
    const channel = transport()
    const completion = channel.client.execute(artifact, {
      ...options,
      onSnapshotUpdates: async () => {},
    })
    const launched = await channel.launched
    expect(() => structuredClone(launched)).not.toThrow()
    if (launched.action !== 'execute')
      throw new Error('Expected isolated request')
    expect(launched.options).not.toHaveProperty('onSnapshotUpdates')
    channel.client.handle({
      type: 'execution-broker-response',
      action: 'result',
      id: launched.id,
      result,
    })
    await completion
  })

  it('rejects ordinary watch clients and mismatched aggregate options before sending', async () => {
    const watch = transport()
    await expect(
      watch.client.executeCohort(cohort, executionOptions())
    ).rejects.toThrow('Watch execution')
    expect(watch.sent).toEqual([])
    const oneShot = transport(false, true)
    await expect(
      oneShot.client.executeCohort(cohort, [
        options,
        {
          ...options,
          entry: secondEntry,
          signal: new AbortController().signal,
        },
      ])
    ).rejects.toThrow('matching execution')
    expect(oneShot.sent).toEqual([])
  })

  it('keeps the live custom provider suite hook in its parent instead of serializing it', async () => {
    const channel = transport(true, true)
    const onCustomCoverageSuite = jest.fn(async () => {})
    await expect(
      channel.client.execute(artifact, {
        ...options,
        onCustomCoverageSuite,
      })
    ).rejects.toThrow('parent broker owner')
    await expect(
      channel.client.executeCohort(
        cohort,
        executionOptions().map((value) => ({ ...value, onCustomCoverageSuite }))
      )
    ).rejects.toThrow('without coverage')
    expect(channel.sent).toEqual([])
    expect(onCustomCoverageSuite).not.toHaveBeenCalled()
  })

  it('retains the entire artifact cohort until cancellation has an authoritative aggregate response', async () => {
    const channel = transport(false, true),
      controller = new AbortController()
    let settled = false
    const completion = channel.client.executeCohort(
      cohort,
      executionOptions().map((value) => ({
        ...value,
        signal: controller.signal,
      }))
    )
    void completion.then(() => {
      settled = true
    })
    const launched = await channel.launched
    controller.abort()
    await channel.cancelled
    expect(settled).toBe(false)
    expect(channel.sent.map((value) => value.action)).toEqual([
      'execute-cohort',
      'cancel',
    ])
    channel.client.handle({
      type: 'execution-broker-response',
      action: 'cohort-result',
      id: launched.id,
      results: results.map((value) => ({ ...value, status: 'cancelled' })),
    })
    expect((await completion).map((value) => value.status)).toEqual([
      'cancelled',
      'cancelled',
    ])
  })

  it('keeps reporter failure while waiting for aggregate cleanup and rejects every cohort result', async () => {
    const channel = transport(false, true),
      failure = new Error('aggregate reporter failed')
    let settled = false
    const completion = channel.client.executeCohort(
      cohort,
      executionOptions().map((value) => ({
        ...value,
        onEvent() {
          throw failure
        },
      }))
    )
    const rejected = completion.catch((error) => {
      settled = true
      return error
    })
    const launched = await channel.launched
    channel.client.handle({
      type: 'execution-broker-response',
      action: 'event',
      id: launched.id,
      event,
    })
    await channel.cancelled
    expect(settled).toBe(false)
    channel.client.handle({
      type: 'execution-broker-response',
      action: 'cohort-result',
      id: launched.id,
      results,
    })
    expect(await rejected).toBe(failure)
  })

  it('rejects omitted or reordered aggregate results after parent completion', async () => {
    const channel = transport(false, true)
    const completion = channel.client.executeCohort(cohort, executionOptions())
    const rejected = completion.catch((error) => error),
      launched = await channel.launched
    channel.client.handle({
      type: 'execution-broker-response',
      action: 'cohort-result',
      id: launched.id,
      results: [...results].reverse(),
    })
    expect(await rejected).toMatchObject({
      message: expect.stringContaining('Mismatched shared cohort'),
    })
  })

  it('disconnects all aggregate calls and prevents a queued launch after synchronous disconnect', async () => {
    const channel = transport(false, true),
      failure = new Error('compiler disconnected')
    const completion = channel.client
      .executeCohort(cohort, executionOptions())
      .catch((error) => error)
    channel.client.disconnect(failure)
    expect(await completion).toBe(failure)
    expect(channel.sent).toEqual([])
    await expect(
      channel.client.executeCohort(cohort, executionOptions())
    ).rejects.toBe(failure)
  })

  it('rejects shared execution on a normal watch host before starting any worker', async () => {
    const delivered = deferred<void>(),
      messages: ExecutionBrokerResponse[] = []
    const host = createExecutionBrokerHost({
      signal: options.signal,
      async send(message) {
        messages.push(message)
        delivered.resolve()
      },
    })
    host.handle(request('watch'))
    await delivered.promise
    await host.close()
    expect(executeCohortWithEnvironment).not.toHaveBeenCalled()
    expect(messages).toEqual([
      expect.objectContaining({
        action: 'error',
        error: expect.objectContaining({
          message: expect.stringContaining('Watch execution'),
        }),
      }),
    ])
    expect(host.ownershipClosed).toBe(true)
  })

  it('owns one aggregate slot and awaits actual aggregate cleanup after cancellation or compiler closure', async () => {
    const started = deferred<void>(),
      aborted = deferred<void>(),
      cleanup = deferred<void>()
    let settled = false
    jest
      .mocked(executeCohortWithEnvironment)
      .mockImplementation(async (_, values) => {
        expect(values[0].signal).toBe(values[1].signal)
        values[0].signal.addEventListener('abort', () => aborted.resolve(), {
          once: true,
        })
        started.resolve()
        await cleanup.promise
        return results.map((value) => ({ ...value, status: 'cancelled' }))
      })
    const messages: ExecutionBrokerResponse[] = []
    const host = createExecutionBrokerHost({
      signal: options.signal,
      allowCohorts: true,
      maxWorkers: 1,
      async send(message) {
        messages.push(message)
      },
    })
    host.handle(request('aggregate'))
    await started.promise
    expect(() => host.handle(request('second-aggregate'))).toThrow(
      'file-worker limit'
    )
    host.handle({
      type: 'execution-broker-request',
      action: 'cancel',
      id: 'aggregate',
    })
    await aborted.promise
    const closing = host.close().then(() => {
      settled = true
    })
    expect(settled).toBe(false)
    expect(host.ownershipClosed).toBe(false)
    cleanup.resolve()
    await closing
    expect(host.ownershipClosed).toBe(true)
    expect(messages.some((message) => message.action === 'cohort-result')).toBe(
      false
    )
  })

  it('defers each file snapshot through the authorized parent callback before the aggregate result', async () => {
    const delivered = deferred<void>(),
      snapshots = deferred<void>(),
      callbackEntered = deferred<void>()
    const messages: ExecutionBrokerResponse[] = [],
      updates = [
        {
          path: '/project/file.ts.snap',
          content: 'staged',
          previousContent: null,
        },
      ]
    jest
      .mocked(executeCohortWithEnvironment)
      .mockImplementation(async (_, values, env, defer) => {
        expect(env).not.toBe(process.env)
        expect(values[0].onSnapshotUpdates).toBeUndefined()
        await defer!(entry.id, entry.file, updates, 'source-hash')
        return results
      })
    const onSnapshotUpdates = jest.fn(async () => {
      callbackEntered.resolve()
      await snapshots.promise
    })
    const host = createExecutionBrokerHost({
      signal: options.signal,
      allowCohorts: true,
      onSnapshotUpdates,
      async send(message) {
        messages.push(message)
        if (message.action === 'cohort-result') delivered.resolve()
      },
    })
    host.handle(request('snapshots', { updateSnapshots: true }))
    await callbackEntered.promise
    expect(messages.some((message) => message.action === 'cohort-result')).toBe(
      false
    )
    expect(onSnapshotUpdates).toHaveBeenCalledWith(
      entry.id,
      entry.file,
      updates,
      'source-hash'
    )
    snapshots.resolve()
    await delivered.promise
    await host.close()
    expect(messages.at(-1)?.action).toBe('cohort-result')
  })

  it('rejects snapshot updates without parent authorization before aggregate execution', async () => {
    const delivered = deferred<void>()
    const host = createExecutionBrokerHost({
      signal: options.signal,
      allowCohorts: true,
      async send() {
        delivered.resolve()
      },
    })
    host.handle(request('unauthorized', { updateSnapshots: true }))
    await delivered.promise
    await host.close()
    expect(executeCohortWithEnvironment).not.toHaveBeenCalled()
    expect(host.ownershipClosed).toBe(true)
  })

  it('keeps a failed aggregate cleanup distinct from successfully delivered terminal IPC', async () => {
    const delivered = deferred<void>(),
      failure = new Error('aggregate cache cleanup failed'),
      messages: ExecutionBrokerResponse[] = []
    jest.mocked(executeCohortWithEnvironment).mockRejectedValue(failure)
    const host = createExecutionBrokerHost({
      signal: options.signal,
      allowCohorts: true,
      async send(message) {
        messages.push(message)
        delivered.resolve()
      },
    })
    host.handle(request('cleanup-failure'))
    await delivered.promise
    await expect(host.close()).rejects.toBe(failure)
    expect(host.ownershipClosed).toBe(false)
    expect(messages).toEqual([
      expect.objectContaining({
        action: 'error',
        error: expect.objectContaining({ message: failure.message }),
      }),
    ])
  })

  it('drains aggregate resources after a broken compiler transport and retains both cleanup failures', async () => {
    const started = deferred<void>(),
      aborted = deferred<void>(),
      cleanup = deferred<void>(),
      output = deferred<void>()
    const transportFailure = new Error('aggregate output transport failed'),
      cleanupFailure = new Error('aggregate group cleanup failed')
    jest
      .mocked(executeCohortWithEnvironment)
      .mockImplementation(async (_, values) => {
        values[0].signal.addEventListener('abort', () => aborted.resolve(), {
          once: true,
        })
        started.resolve()
        values[0].onEvent(event)
        await cleanup.promise
        throw cleanupFailure
      })
    const host = createExecutionBrokerHost({
      signal: options.signal,
      allowCohorts: true,
      async send() {
        output.resolve()
        throw transportFailure
      },
    })
    host.handle(request('transport-failure'))
    await started.promise
    await output.promise
    await aborted.promise
    let closed = false
    const closing = host.close().catch((error) => {
      closed = true
      return error
    })
    expect(closed).toBe(false)
    cleanup.resolve()
    const failure = await closing
    expect(failure).toBeInstanceOf(AggregateError)
    expect(failure.errors).toEqual([cleanupFailure, transportFailure])
    expect(host.ownershipClosed).toBe(false)
  })

  it('does not accept a forged child-like closure flag or error name as parent ownership', async () => {
    const delivered = deferred<void>()
    const failure = Object.assign(new Error('forged closure'), {
      name: 'CohortExecutionClosedError',
      ownershipClosed: true,
      cancelled: true,
    })
    jest.mocked(executeCohortWithEnvironment).mockRejectedValueOnce(failure)
    const messages: ExecutionBrokerResponse[] = []
    const host = createExecutionBrokerHost({
      allowCohorts: true,
      signal: new AbortController().signal,
      async send(message) {
        messages.push(message)
        if (message.action === 'error') delivered.resolve()
      },
    })
    host.handle(request('forged-closure'))
    await delivered.promise
    await expect(host.close()).rejects.toBe(failure)
    expect(host.ownershipClosed).toBe(false)
    expect(
      messages.some(
        (message) =>
          message.action === 'error' && message.ownershipClosed === true
      )
    ).toBe(false)
  })
})

describe('parent-owned browser watch leases', () => {
  const browserProfile = { ...profile, environment: 'browser' as const }
  const browserEntry = { ...entry, profile: browserProfile }
  const browserArtifact = {
    ...artifact,
    profile: browserProfile,
    applicationServer: {
      mode: 'development' as const,
      lockDistDir: true as const,
      distDir: '/project/.next',
    },
  }
  it.each(['profile', 'application'] as const)(
    'refuses child escalation of parent %s metadata before acquisition',
    async (changed) => {
      const server = await import(
        'next/dist/experimental/testing/browser/server'
      )
      const start = jest.spyOn(server, 'createApplicationServer')
      const delivered = deferred<void>(),
        messages: ExecutionBrokerResponse[] = []
      const host = createExecutionBrokerHost({
        signal: options.signal,
        browserProjects: [{ profile: browserProfile, entries: [browserEntry] }],
        browserApplications: [
          {
            profile: browserProfile,
            projectDir: '/project',
            distDir: '/project/.next',
            lockDistDir: true,
          },
        ],
        async send(message) {
          messages.push(message)
          delivered.resolve()
        },
      })
      try {
        host.handle({
          type: 'execution-broker-request',
          id: 'escalation',
          action: 'execute',
          artifact:
            changed === 'profile'
              ? {
                  ...browserArtifact,
                  profile: { ...browserProfile, browserClient: true },
                }
              : {
                  ...browserArtifact,
                  applicationServer: {
                    ...browserArtifact.applicationServer,
                    distDir: '/outside',
                  },
                },
          options: { ...options, entry: browserEntry },
          env: { ...process.env },
        })
        await delivered.promise
        expect(start).not.toHaveBeenCalled()
        expect(messages).toEqual([expect.objectContaining({ action: 'error' })])
      } finally {
        await host.close().catch(() => {})
        start.mockRestore()
      }
    }
  )
  it('retains application and host owners until driver cleanup finishes after coordinator cancellation', async () => {
    const server = await import('next/dist/experimental/testing/browser/server')
    const browser = await import('next/dist/experimental/testing/browser/host')
    const execution = await import(
      'next/dist/experimental/testing/execution/execute'
    )
    const started = deferred<void>(),
      cancelled = deferred<void>(),
      cleanup = deferred<void>()
    const order: string[] = []
    const serverDispose = jest.fn(async () => {
      order.push('server')
    })
    const hostDispose = jest.fn(async () => {
      order.push('host')
    })
    const spies = [
      jest.spyOn(server, 'createApplicationServer').mockResolvedValue({
        baseURL: 'http://127.0.0.1:1',
        pid: 123,
        lifetime: 'file',
        attachments: [],
        dispose: serverDispose,
      }),
      jest.spyOn(browser, 'createBrowserHost').mockResolvedValue({
        wsEndpoint: 'ws://127.0.0.1:2',
        dispose: hostDispose,
      }),
      jest
        .spyOn(execution, 'executeWithEnvironment')
        .mockImplementation(async (_, values) => {
          expect(values.browser).toMatchObject({
            baseURL: 'http://127.0.0.1:1',
            wsEndpoint: 'ws://127.0.0.1:2',
          })
          values.signal.addEventListener('abort', () => cancelled.resolve(), {
            once: true,
          })
          started.resolve()
          await cleanup.promise
          order.push('driver')
          return { ...result, status: 'cancelled' }
        }),
    ]
    const host = createExecutionBrokerHost({
      signal: new AbortController().signal,
      browserProjects: [{ profile: browserProfile, entries: [browserEntry] }],
      browserApplications: [
        {
          profile: browserProfile,
          projectDir: '/project',
          distDir: '/project/.next',
          lockDistDir: true,
        },
      ],
      async send() {},
    })
    try {
      host.handle({
        type: 'execution-broker-request',
        action: 'execute',
        id: 'browser',
        artifact: browserArtifact,
        options: { ...options, entry: browserEntry },
        env: { ...process.env },
      })
      await started.promise
      const closing = host.close()
      await cancelled.promise
      expect(hostDispose).not.toHaveBeenCalled()
      expect(serverDispose).not.toHaveBeenCalled()
      cleanup.resolve()
      await closing
      expect(order).toEqual(['driver', 'host', 'server'])
      expect(host.ownershipClosed).toBe(true)
    } finally {
      cleanup.resolve()
      await host.close()
      for (const spy of spies) spy.mockRestore()
    }
  })
})

it.each(['passed', 'failed'] as const)(
  'holds the %s runtime acknowledgement until the parent post-cleanup receipt seal',
  async (status) => {
    const execution = await import(
      'next/dist/experimental/testing/execution/execute'
    )
    const order: string[] = [],
      worker = deferred<void>(),
      sealing = deferred<void>(),
      started = deferred<void>(),
      sealingStarted = deferred<void>(),
      finished = deferred<void>()
    const spy = jest
      .spyOn(execution, 'executeWithEnvironment')
      .mockImplementation(async () => {
        order.push('worker')
        started.resolve()
        await worker.promise
        order.push('worker-closed')
        return { ...result, status }
      })
    const sent: ExecutionBrokerResponse[] = []
    const host = createExecutionBrokerHost({
      signal: new AbortController().signal,
      allowCoverage: true,
      async onRuntimeConfiguration() {
        order.push('parent-check')
        return async () => {
          order.push('seal')
          sealingStarted.resolve()
          await sealing.promise
          order.push('sealed')
        }
      },
      async send(value) {
        sent.push(value)
        if (value.action === 'result') finished.resolve()
      },
    })
    try {
      host.handle({
        type: 'execution-broker-request',
        action: 'execute',
        id: 'runtime',
        artifact,
        options: { ...options, coverage: { version: 1, kind: 'node-line' } },
        env: { ...process.env },
      })
      await started.promise
      expect(order).toEqual(['parent-check', 'worker'])
      worker.resolve()
      await sealingStarted.promise
      expect(sent.some((value) => value.action === 'result')).toBe(false)
      sealing.resolve()
      await finished.promise
      expect(order).toEqual([
        'parent-check',
        'worker',
        'worker-closed',
        'seal',
        'sealed',
      ])
      expect(sent.at(-1)).toMatchObject({
        action: 'result',
        result: { status },
      })
    } finally {
      worker.resolve()
      sealing.resolve()
      await host.close()
      spy.mockRestore()
    }
  }
)
it('refuses a runtime config artifact before launching a worker without parent authorization', async () => {
  const execution = await import(
      'next/dist/experimental/testing/execution/execute'
    ),
    spy = jest.spyOn(execution, 'executeWithEnvironment')
  const completed = deferred<void>(),
    sent: ExecutionBrokerResponse[] = []
  const host = createExecutionBrokerHost({
    signal: new AbortController().signal,
    allowCoverage: true,
    async send(value) {
      sent.push(value)
      completed.resolve()
    },
  })
  try {
    host.handle({
      type: 'execution-broker-request',
      action: 'execute',
      id: 'runtime-unowned',
      artifact: {
        ...artifact,
        runtimeConfigurationImports: {
          path: 'unowned',
          sha256: '0'.repeat(64),
        },
      },
      options: { ...options, coverage: { version: 1, kind: 'node-line' } },
      env: { ...process.env },
    })
    await completed.promise
    expect(spy).not.toHaveBeenCalled()
    expect(sent[0]).toMatchObject({
      action: 'error',
      error: {
        message: expect.stringContaining('parent-authorized standard coverage'),
      },
    })
  } finally {
    await host.close()
    spy.mockRestore()
  }
})

it('omits the scheduling signal from compiler IPC and preserves the lifetime channel', async () => {
  const channel = transport(true)
  const lifetime = new AbortController()
  const user = new AbortController()
  const completion = channel.client.execute(artifact, {
    ...options,
    signal: lifetime.signal,
    userCancelSignal: user.signal,
    coverage: { version: 1, kind: 'node-line' },
    async onCoverage() {},
  })
  const request = await channel.launched
  expect(request.action).toBe('execute')
  if (request.action !== 'execute') throw new Error('Expected execution')
  expect(request.options).not.toHaveProperty('userCancelSignal')
  expect(request.options).not.toHaveProperty('signal')
  user.abort()
  expect(channel.sent.map(({ action }) => action)).toEqual(['execute'])
  expect(lifetime.signal.aborted).toBe(false)
  channel.client.handle({
    type: 'execution-broker-response',
    action: 'result',
    id: request.id,
    result,
  })
  expect(await completion).toEqual(result)
})

it('uses only the host scheduling signal and retains the worker until actual completion', async () => {
  const execution = await import(
    'next/dist/experimental/testing/execution/execute'
  )
  const entered = deferred<void>()
  const closed = deferred<void>()
  const received = deferred<void>()
  const user = new AbortController()
  let fileLifetime: AbortSignal | undefined
  const spy = jest
    .spyOn(execution, 'executeWithEnvironment')
    .mockImplementation(async (_artifact, input) => {
      expect(input.userCancelSignal).toBe(user.signal)
      fileLifetime = input.signal
      entered.resolve()
      await closed.promise
      return result
    })
  const sent: ExecutionBrokerResponse[] = []
  const host = createExecutionBrokerHost({
    signal: new AbortController().signal,
    userCancelSignal: user.signal,
    allowCoverage: true,
    async send(message) {
      sent.push(message)
      if (message.action === 'result') received.resolve()
    },
  })
  try {
    host.handle({
      type: 'execution-broker-request',
      action: 'execute',
      id: 'user-cancel-authority',
      artifact,
      options: { ...options, coverage: { version: 1, kind: 'node-line' } },
      env: { ...process.env },
    })
    await entered.promise
    user.abort()
    expect(fileLifetime?.aborted).toBe(false)
    expect(sent).toEqual([])
    closed.resolve()
    await received.promise
    expect(sent.at(-1)).toMatchObject({ action: 'result', result })
  } finally {
    closed.resolve()
    await host.close()
    spy.mockRestore()
  }
})
