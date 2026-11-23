// Unit tests should test a specific utility without a browser or running
// `next`. Import the code under test from the compiled output, e.g.
// import { htmlEscapeJsonString } from 'next/dist/shared/lib/htmlescape'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { Worker, WorkerExitError } from 'next/dist/lib/worker'

type TestWorker = Worker & Record<string, (...args: any[]) => Promise<unknown>>

/**
 * Real child processes and worker threads whose calls throw unusual values,
 * return values that can't be sent back, or crash the worker after replying.
 */
describe.each([
  ['child processes', false],
  ['worker threads', true],
])('worker errors with %s', (_, enableWorkerThreads) => {
  let dir: string
  let workerPath: string
  const workers: Worker[] = []

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'worker-errors-'))
    workerPath = path.join(dir, 'worker.js')
    fs.writeFileSync(
      workerPath,
      `exports.ok = (value) => value
exports.sleep = () => new Promise((resolve) => setTimeout(() => resolve('slept'), 200))
exports.throwString = () => { throw 'string boom' }
exports.throwUndefined = () => { throw undefined }
exports.bigint = () => 10n
exports.circular = () => { const x = {}; x.x = x; return x }
exports.errorWithFunction = () => {
  throw Object.assign(new Error('fn prop boom'), { code: 'E_FN', retry() {} })
}
exports.errorWithCause = () => {
  const inner = Object.assign(new TypeError('inner boom', { cause: 'root' }), {
    code: 'E_INNER',
  })
  throw Object.assign(new Error('outer boom', { cause: inner }), {
    code: 'E_OUTER',
  })
}
exports.errorWithUnsendableCause = () => {
  const cause = Object.assign(new Error('cause boom'), { retry() {} })
  throw Object.assign(new Error('outer boom', { cause }), { code: 'E_KEEP' })
}
exports.errorWithNullishCause = (cause) => {
  throw new Error('nullish cause', { cause: cause === 'null' ? null : undefined })
}
exports.errorWithDeepCause = () => {
  let error = new Error('cause 10')
  for (let i = 9; i >= 0; i--) {
    error = new Error(i === 0 ? 'outer boom' : 'cause ' + i, { cause: error })
  }
  throw error
}
exports.strayThrow = () =>
  new Promise(() => {
    setTimeout(() => { throw new Error('stray async error') }, 20)
  })
`
    )
  })

  afterEach(() => {
    for (const worker of workers.splice(0)) {
      worker.shutdownNow()
    }
  })

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  const createWorker = (
    options: Partial<ConstructorParameters<typeof Worker>[1]> = {}
  ) => {
    const worker = new Worker(workerPath, {
      exposedMethods: [
        'ok',
        'sleep',
        'throwString',
        'throwUndefined',
        'bigint',
        'circular',
        'errorWithFunction',
        'errorWithCause',
        'errorWithUnsendableCause',
        'errorWithDeepCause',
        'errorWithNullishCause',
        'strayThrow',
      ],
      maxWorkers: 1,
      enableWorkerThreads,
      ...options,
    }) as TestWorker
    workers.push(worker)
    return worker
  }

  it('rejects with a thrown string itself', async () => {
    const worker = createWorker()
    await expect(worker.throwString()).rejects.toBe('string boom')
  })

  it('rejects with an error for a thrown undefined', async () => {
    const worker = createWorker()
    await expect(worker.throwUndefined()).rejects.toThrow(
      '"null" or "undefined" thrown'
    )
  })

  it('recreates the cause of an error, like in the worker', async () => {
    const worker = createWorker()
    const error: any = await worker.errorWithCause().catch((err) => err)
    expect(error).toBeInstanceOf(Error)
    expect(error.message).toBe('outer boom')
    expect(error.code).toBe('E_OUTER')
    expect(error.type).toBe('Error')
    // Like `new Error(message, { cause })`: `cause` (and the jest-worker
    // compatible `type`) aren't enumerable, so they aren't printed as
    // properties of the error.
    expect(Object.keys(error)).toEqual(['code'])

    const cause = error.cause
    expect(cause).toBeInstanceOf(TypeError)
    expect(cause.message).toBe('inner boom')
    expect(cause.code).toBe('E_INNER')
    expect(cause.stack).toContain('inner boom')
    expect(Object.keys(cause)).toEqual(['code'])
    // A cause that isn't an error is passed through.
    expect(cause.cause).toBe('root')
  })

  it('keeps the properties of an error whose cause cannot be sent', async () => {
    const worker = createWorker()
    const error: any = await worker
      .errorWithUnsendableCause()
      .catch((err) => err)
    expect(error.message).toBe('outer boom')
    if (enableWorkerThreads) {
      // Structured clone can't send a function: only the cause is dropped.
      expect(error.code).toBe('E_KEEP')
      expect(error.cause).toBeUndefined()
    } else {
      // JSON drops the function, so the cause itself can be sent.
      expect(error.code).toBe('E_KEEP')
      expect(error.cause).toBeInstanceOf(Error)
      expect(error.cause.message).toBe('cause boom')
    }
    await expect(worker.ok('after')).resolves.toBe('after')
  })

  it('passes a null cause through and ignores an undefined one', async () => {
    const worker = createWorker()
    const withNull: any = await worker
      .errorWithNullishCause('null')
      .catch((err) => err)
    expect(withNull.message).toBe('nullish cause')
    expect(Object.prototype.hasOwnProperty.call(withNull, 'cause')).toBe(true)
    expect(withNull.cause).toBeNull()

    const withUndefined: any = await worker
      .errorWithNullishCause('undefined')
      .catch((err) => err)
    expect(withUndefined.message).toBe('nullish cause')
    expect(withUndefined.cause).toBeUndefined()
  })

  it('recreates nested causes up to a fixed depth', async () => {
    const worker = createWorker()
    const error: any = await worker.errorWithDeepCause().catch((err) => err)
    const messages: string[] = []
    for (let cause = error.cause; cause !== undefined; cause = cause.cause) {
      messages.push(cause.message)
    }
    expect(messages).toEqual([
      'cause 1',
      'cause 2',
      'cause 3',
      'cause 4',
      'cause 5',
    ])
  })

  it.each(['bigint', 'circular', 'errorWithFunction'])(
    'fails only the %s call when its outcome cannot be sent',
    async (method) => {
      const worker = createWorker({ concurrencyPerWorker: 4 })
      const [outcome, other] = await Promise.allSettled([
        worker[method](),
        worker.sleep(),
      ])
      expect(other).toEqual({ status: 'fulfilled', value: 'slept' })
      if (outcome.status === 'fulfilled') {
        // Structured clone (worker threads) can send BigInt and circular data.
        expect(enableWorkerThreads).toBe(true)
        expect(method).not.toBe('errorWithFunction')
      } else {
        expect(outcome.reason).toBeInstanceOf(Error)
        expect(outcome.reason).not.toBeInstanceOf(WorkerExitError)
        if (method === 'errorWithFunction') {
          expect(outcome.reason.message).toBe('fn prop boom')
        }
      }
      // The worker is still usable.
      await expect(worker.ok('after')).resolves.toBe('after')
    }
  )

  it('retries a call whose worker crashed, and runs the queued calls', async () => {
    const onRestart = jest.fn()
    const worker = createWorker({ maxRetries: 1, onRestart })
    const results = await Promise.allSettled([
      worker.strayThrow(),
      worker.ok('queued1'),
      worker.ok('queued2'),
    ])
    expect(results[0].status).toBe('rejected')
    expect((results[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      WorkerExitError
    )
    expect(results.slice(1)).toEqual([
      { status: 'fulfilled', value: 'queued1' },
      { status: 'fulfilled', value: 'queued2' },
    ])
    expect(onRestart).toHaveBeenCalledTimes(1)
  })
})
