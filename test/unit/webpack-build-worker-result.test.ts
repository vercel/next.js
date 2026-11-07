/* eslint-env jest */
import path from 'path'
import { Worker } from 'next/dist/lib/worker'
import { assertWorkerResultSerializable } from 'next/dist/build/webpack-build/assert-worker-result-serializable'

describe('assertWorkerResultSerializable', () => {
  it('accepts serializable results', () => {
    expect(() =>
      assertWorkerResultSerializable({ a: [1, 'b', { c: null }] }, 'server')
    ).not.toThrow()
  })

  it('throws a descriptive error for a BigInt', () => {
    expect(() =>
      assertWorkerResultSerializable({ value: BigInt(1) }, 'server')
    ).toThrow(
      /The webpack build worker result for the "server" compiler could not be sent to the main process: .*BigInt/
    )
  })

  it('throws a descriptive error for a cycle', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(() => assertWorkerResultSerializable(cyclic, 'client')).toThrow(
      /The webpack build worker result for the "client" compiler could not be sent to the main process: .*circular/i
    )
  })

  it('checks the IPC message and reports string length errors', () => {
    const result = { value: 'result' }
    const stringify = jest
      .spyOn(JSON, 'stringify')
      .mockImplementationOnce(() => {
        throw new RangeError('Invalid string length')
      })
    try {
      expect(() => assertWorkerResultSerializable(result, 'server')).toThrow(
        'The webpack build worker result for the "server" compiler could not be sent to the main process: Invalid string length'
      )
      expect(stringify).toHaveBeenCalledWith([0, result])
    } finally {
      stringify.mockRestore()
    }
  })
})

describe('build worker with an unserializable result', () => {
  it('rejects the call instead of hanging', async () => {
    const worker = new Worker(
      path.join(__dirname, 'webpack-build-worker-result', 'worker.js'),
      {
        exposedMethods: ['unserializable'],
        debuggerPortOffset: -1,
        isolatedMemory: true,
        numWorkers: 1,
        maxRetries: 0,
      }
    ) as Worker & { unserializable: () => Promise<unknown> }
    try {
      await expect(worker.unserializable()).rejects.toThrow(
        /The webpack build worker result for the "server" compiler could not be sent to the main process/
      )
    } finally {
      await worker.end()
    }
  }, 30_000)
})
