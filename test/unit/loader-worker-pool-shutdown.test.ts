import { Worker } from 'worker_threads'
import { runLoaderWorkerPool } from 'next/dist/build/swc/loaderWorkerPool'
import type * as Native from 'next/dist/build/swc/generated-native'

jest.mock('worker_threads', () => ({ Worker: jest.fn() }))

async function createScheduler() {
  let create!: Parameters<typeof Native.registerWorkerScheduler>[0]
  let terminate!: Parameters<typeof Native.registerWorkerScheduler>[1]
  const bindings = {
    registerWorkerScheduler: jest.fn(
      (
        onCreate: Parameters<typeof Native.registerWorkerScheduler>[0],
        onTerminate: Parameters<typeof Native.registerWorkerScheduler>[1]
      ) => {
        create = onCreate
        terminate = onTerminate
      }
    ),
  } as unknown as typeof Native
  await runLoaderWorkerPool(bindings, '/native.node')
  return { create, terminate }
}

const options = { filename: '/loader-worker.js', cwd: '/project' }

afterEach(() => jest.clearAllMocks())

it('acknowledges termination only after the worker has exited', async () => {
  let exited!: (code: number) => void
  const terminate = jest.fn(
    () =>
      new Promise<number>((resolve) => {
        exited = resolve
      })
  )
  jest
    .mocked(Worker)
    .mockImplementation(() => ({ threadId: 7, terminate }) as unknown as Worker)
  const scheduler = await createScheduler()
  scheduler.create({ options })
  expect(Worker).toHaveBeenCalledWith(options.filename, {
    workerData: { bindingPath: '/native.node', cwd: options.cwd },
  })

  const termination = scheduler.terminate({ options, workerId: 7 })
  expect(termination).toBeInstanceOf(Promise)
  let acknowledged = false
  void termination.then(() => {
    acknowledged = true
  })
  await Promise.resolve()
  expect(acknowledged).toBe(false)
  exited(0)
  await termination
  expect(acknowledged).toBe(true)

  await scheduler.terminate({ options, workerId: 7 })
  expect(terminate).toHaveBeenCalledTimes(1)
})

it('propagates termination failure and keeps the worker available for retry', async () => {
  const error = new Error('termination failed')
  const terminate = jest
    .fn()
    .mockRejectedValueOnce(error)
    .mockResolvedValueOnce(0)
  jest
    .mocked(Worker)
    .mockImplementation(() => ({ threadId: 8, terminate }) as unknown as Worker)
  const scheduler = await createScheduler()
  scheduler.create({ options })
  await expect(scheduler.terminate({ options, workerId: 8 })).rejects.toBe(
    error
  )
  await scheduler.terminate({ options, workerId: 8 })
  expect(terminate).toHaveBeenCalledTimes(2)
})

it('acknowledges a worker that has already been removed', async () => {
  const scheduler = await createScheduler()
  await expect(
    scheduler.terminate({
      options: { filename: '/unused.js', cwd: '/unused' },
      workerId: 9,
    })
  ).resolves.toBeUndefined()
})
