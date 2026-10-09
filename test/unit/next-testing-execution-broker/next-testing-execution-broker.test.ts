import {
  createExecutionBrokerClient,
  createExecutionBrokerHost,
  type ExecutionBrokerRequest,
  type ExecutionBrokerResponse,
} from 'next/dist/experimental/testing/execution/broker'
import type {
  CompiledTestArtifact,
  ExecuteTestOptions,
} from 'next/dist/experimental/testing/contracts'
import { promises as fs } from 'fs'
import { basename } from 'path'

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

function transport() {
  const sent: ExecutionBrokerRequest[] = []
  const launched = deferred<ExecutionBrokerRequest>()
  const cancelled = deferred<void>()
  const client = createExecutionBrokerClient({
    async send(message) {
      sent.push(message)
      if (message.action === 'execute') launched.resolve(message)
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
