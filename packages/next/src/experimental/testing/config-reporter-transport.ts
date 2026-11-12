import { randomUUID } from 'node:crypto'
import type { TestProcessExit, TestProcessOptions } from './execution/process'

/** A reporter sub-session belongs to the already retained configuration process. */
export function createConfigReporterTransport(options: {
  send(message: object): Promise<void>
  exit: Promise<TestProcessExit | void>
  available(): boolean
  abort(error: unknown): void
}) {
  let used = false
  let initialCloseFailure: 'sync' | 'async' | undefined
  let current:
    | {
        id: string
        options: TestProcessOptions
        resolve(result: TestProcessExit): void
        reject(error: unknown): void
        cancel(): void
        failed: boolean
        failure?: unknown
      }
    | undefined

  function fail(error: unknown) {
    if (!current) return
    if (!current.failed) current.failure = error
    current.failed = true
    options.abort(error)
  }
  function close(result: TestProcessExit) {
    const session = current
    if (!session) return
    current = undefined
    session.options.signal?.removeEventListener('abort', session.cancel)
    if (session.failed) session.reject(session.failure)
    else session.resolve(result)
  }
  void options.exit.then(
    (result) => {
      if (current && !current.failed) {
        current.failure = new Error(
          'Configuration process closed before its reporter sub-session.'
        )
        current.failed = true
      }
      close(result ?? { reason: 'exit', code: 1, signal: null })
    },
    (error) => {
      if (current && !current.failed) {
        current.failure = error
        current.failed = true
      }
      close({ reason: 'exit', code: 1, signal: null })
    }
  )

  return {
    get active() {
      return current !== undefined
    },
    get initialCloseFailure() {
      return initialCloseFailure
    },
    run(processOptions: TestProcessOptions): Promise<TestProcessExit> {
      if (used || !options.available())
        return Promise.reject(
          new Error('Configuration reporter sub-session is unavailable.')
        )
      if (processOptions.signal?.aborted)
        return Promise.resolve({
          reason: 'cancelled',
          code: null,
          signal: null,
        })
      used = true
      return new Promise<TestProcessExit>((resolve, reject) => {
        const id = randomUUID()
        const cancel = () => fail(processOptions.signal?.reason)
        current = {
          id,
          options: processOptions,
          resolve,
          reject,
          cancel,
          failed: false,
        }
        processOptions.signal?.addEventListener('abort', cancel, { once: true })
        const send = (message: unknown) =>
          options.send({
            type: 'config-reporter-message',
            reporterId: id,
            message,
          })
        try {
          processOptions.onReady?.(send, () => {
            throw new Error(
              'A reporter cannot terminate its retained configuration process.'
            )
          })
          void send({ type: 'run', input: processOptions.input }).catch(fail)
        } catch (error) {
          fail(error)
        }
      })
    },
    onMessage(message: unknown): boolean {
      if (
        !message ||
        typeof message !== 'object' ||
        !('type' in message) ||
        !['config-reporter-message', 'config-reporter-closed'].includes(
          message.type as string
        )
      )
        return false
      const session = current
      if (
        !session ||
        !('reporterId' in message) ||
        message.reporterId !== session.id
      )
        throw new Error('Unexpected configuration reporter response.')
      if (message.type === 'config-reporter-closed') {
        if (!('code' in message) || ![0, 1].includes(message.code as number))
          throw new Error('Invalid configuration reporter close result.')
        const sync =
          'initialCloseSyncFailed' in message &&
          message.initialCloseSyncFailed === true
        const asynchronous =
          'initialCloseAsyncFailed' in message &&
          message.initialCloseAsyncFailed === true
        if (
          (sync && asynchronous) ||
          ((sync || asynchronous) && message.code !== 1) ||
          ('initialCloseSyncFailed' in message && !sync) ||
          ('initialCloseAsyncFailed' in message && !asynchronous)
        )
          throw new Error('Invalid configuration reporter close failure state.')
        initialCloseFailure = sync ? 'sync' : asynchronous ? 'async' : undefined
        close({ reason: 'exit', code: message.code as number, signal: null })
      } else {
        if (!('message' in message))
          throw new Error('Configuration reporter response has no payload.')
        try {
          session.options.onMessage(message.message)
        } catch (error) {
          fail(error)
        }
      }
      return true
    },
    onOutput(stream: 'stdout' | 'stderr', chunk: Buffer): boolean {
      if (!current) return false
      try {
        current.options.onOutput?.(stream, chunk)
      } catch (error) {
        fail(error)
      }
      return true
    },
  }
}
