import { randomUUID } from 'node:crypto'
import type {
  CompiledTestArtifact,
  ExecuteTest,
  ExecuteTestOptions,
} from '../contracts'
import type {
  FileResult,
  ResultEvent,
  SerializedDiagnostic,
} from '../reporting/events'
import { serializeDiagnostic } from '../reporting/diagnostics'
import { executeWithEnvironment } from './execute'

type SerializableOptions = Omit<
  ExecuteTestOptions,
  'signal' | 'onEvent' | 'onCoverage'
>

export type ExecutionBrokerRequest =
  | {
      type: 'execution-broker-request'
      id: string
      action: 'execute'
      artifact: CompiledTestArtifact
      options: SerializableOptions
      /** Private IPC only: never log, fingerprint, or report this object. */
      env: NodeJS.ProcessEnv
    }
  | { type: 'execution-broker-request'; id: string; action: 'cancel' }

export type ExecutionBrokerResponse =
  | {
      type: 'execution-broker-response'
      id: string
      action: 'event'
      event: ResultEvent
    }
  | {
      type: 'execution-broker-response'
      id: string
      action: 'result'
      result: FileResult
    }
  | {
      type: 'execution-broker-response'
      id: string
      action: 'error'
      error: SerializedDiagnostic
    }

/** The watch parent owns every detached file worker, including after child crash. */
export function createExecutionBrokerHost(options: {
  signal: AbortSignal
  send(message: ExecutionBrokerResponse): Promise<void>
}) {
  const active = new Map<
    string,
    { controller: AbortController; task: Promise<void> }
  >()
  const seen = new Set<string>()
  let closing: Promise<void> | undefined
  let closed = false
  let ownershipClosed = false
  let transportFailure: { error: unknown } | undefined
  const cleanupFailures: unknown[] = []
  let sends = Promise.resolve()
  let releaseSends!: () => void
  const stopped = new Promise<void>((resolve) => {
    releaseSends = resolve
  })

  function abortAll(reason: unknown) {
    for (const request of active.values()) request.controller.abort(reason)
  }
  const onAbort = () => abortAll(options.signal.reason)
  options.signal.addEventListener('abort', onAbort)

  function publish(message: ExecutionBrokerResponse) {
    if (closed) return Promise.resolve()
    sends = sends.then(() => {
      if (!closed) return options.send(message)
    })
    // Observe sends as soon as queued, even while execute is still running.
    void sends.catch((error) => {
      transportFailure ??= { error }
      abortAll(error)
    })
    return Promise.race([sends, stopped])
  }

  return {
    /** Available after close settles, including a transport-only rejection. */
    get ownershipClosed() {
      return ownershipClosed
    },
    handle(value: unknown): boolean {
      if (
        !value ||
        typeof value !== 'object' ||
        !('type' in value) ||
        value.type !== 'execution-broker-request'
      ) {
        return false
      }
      const message = value as ExecutionBrokerRequest
      if (typeof message.id !== 'string' || !message.id) {
        throw new Error('Invalid execution broker request identity')
      }
      if (message.action === 'cancel') {
        active
          .get(message.id)
          ?.controller.abort(new Error('Test file cancelled'))
        return true
      }
      if (message.action !== 'execute') {
        throw new Error('Invalid execution broker request action')
      }
      if (closed || transportFailure) {
        throw new Error('The execution broker is closed')
      }
      if (seen.has(message.id)) {
        throw new Error('Duplicate execution broker request identity')
      }
      seen.add(message.id)
      const request = {
        controller: new AbortController(),
        task: Promise.resolve(),
      }
      active.set(message.id, request)
      if (options.signal.aborted)
        request.controller.abort(options.signal.reason)
      request.task = (async () => {
        let executing = false
        try {
          if (
            message.options.coverage ||
            message.options.updateSnapshots ||
            message.options.browser ||
            message.artifact.profile.environment === 'browser'
          ) {
            throw new Error(
              'Watch execution supports read-only Node and RSC files; browser, coverage and snapshot updates are unavailable'
            )
          }
          executing = true
          const result = await executeWithEnvironment(
            message.artifact,
            {
              ...message.options,
              signal: request.controller.signal,
              onEvent(event) {
                void publish({
                  type: 'execution-broker-response',
                  id: message.id,
                  action: 'event',
                  event,
                }).catch(() => {})
              },
            },
            { ...message.env }
          )
          executing = false
          // Ordered delivery keeps all output/cleanup events before the result.
          await publish({
            type: 'execution-broker-response',
            id: message.id,
            action: 'result',
            result,
          })
        } catch (error) {
          // An execute rejection can mean a process-group/cache cleanup failed.
          // Reporting it to the child must not later certify ownership closure.
          if (executing) cleanupFailures.push(error)
          if (!closed && !transportFailure) {
            await publish({
              type: 'execution-broker-response',
              id: message.id,
              action: 'error',
              error: serializeDiagnostic(error, { phase: 'runtime' }),
            })
          }
        } finally {
          active.delete(message.id)
        }
      })().catch((error) => {
        transportFailure ??= { error }
        abortAll(error)
      })
      return true
    },
    close(): Promise<void> {
      if (closing) return closing
      closed = true
      // An unresponsive compiler child may not drain IPC. Release transport
      // waits so the outer supervisor can terminate it after our workers close.
      releaseSends()
      options.signal.removeEventListener('abort', onAbort)
      abortAll(new Error('Execution broker closed'))
      closing = (async () => {
        // Each task settles only after B's real process/cache disposal, even if
        // the compiler child has disappeared and terminal IPC cannot be sent.
        await Promise.all([...active.values()].map((request) => request.task))
        ownershipClosed = cleanupFailures.length === 0
        const failures = [
          ...cleanupFailures,
          ...(transportFailure ? [transportFailure.error] : []),
        ]
        if (failures.length === 1) throw failures[0]
        if (failures.length)
          throw new AggregateError(failures, 'Execution broker cleanup failed')
      })()
      return closing
    },
  }
}

function remoteError(diagnostic: SerializedDiagnostic): Error {
  const options = diagnostic.cause
    ? { cause: remoteError(diagnostic.cause) }
    : undefined
  const error = diagnostic.errors
    ? new AggregateError(
        diagnostic.errors.map(remoteError),
        diagnostic.message,
        options
      )
    : new Error(diagnostic.message, options)
  if (diagnostic.name) error.name = diagnostic.name
  if (diagnostic.stack) error.stack = diagnostic.stack
  return error
}

/** The fresh compiler child delegates execution and retains its artifact lease. */
export function createExecutionBrokerClient(options: {
  send(message: ExecutionBrokerRequest): Promise<void>
}) {
  interface Pending {
    resolve(result: FileResult): void
    reject(error: unknown): void
    onEvent(event: ResultEvent): void
    signal: AbortSignal
    onAbort(): void
    failure?: { error: unknown }
  }
  const pending = new Map<string, Pending>()
  let disconnected: Error | undefined

  function disconnect(error: Error) {
    disconnected ??= error
    for (const request of pending.values()) {
      request.signal.removeEventListener('abort', request.onAbort)
      request.reject(request.failure?.error ?? error)
    }
    pending.clear()
  }

  const execute: ExecuteTest = (artifact, executionOptions) => {
    if (disconnected) return Promise.reject(disconnected)
    if (executionOptions.coverage || executionOptions.onCoverage) {
      return Promise.reject(
        new Error('Watch execution does not support coverage')
      )
    }
    const id = randomUUID()
    const {
      signal,
      onEvent,
      onCoverage: _onCoverage,
      ...serializable
    } = executionOptions
    return new Promise<FileResult>((resolve, reject) => {
      let sent = Promise.resolve()
      let cancellationSent = false
      function cancel() {
        if (cancellationSent) return
        cancellationSent = true
        // Send cancellation after the launch request, then keep waiting for the
        // authoritative result. Early rejection could release the artifact.
        sent = sent.then(() => {
          if (disconnected) throw disconnected
          return options.send({
            type: 'execution-broker-request',
            action: 'cancel',
            id,
          })
        })
        void sent.catch((error) => disconnect(asError(error)))
      }
      const request: Pending = {
        resolve,
        reject,
        onEvent,
        signal,
        onAbort: cancel,
      }
      pending.set(id, request)
      sent = Promise.resolve().then(() => {
        if (disconnected) throw disconnected
        return options.send({
          type: 'execution-broker-request',
          id,
          action: 'execute',
          artifact,
          options: serializable,
          env: { ...process.env },
        })
      })
      void sent.catch((error) => disconnect(asError(error)))
      signal.addEventListener('abort', cancel, { once: true })
      if (signal.aborted) cancel()
    })
  }

  return {
    execute,
    disconnect,
    handle(value: unknown): boolean {
      if (
        !value ||
        typeof value !== 'object' ||
        !('type' in value) ||
        value.type !== 'execution-broker-response'
      ) {
        return false
      }
      const message = value as ExecutionBrokerResponse
      if (typeof message.id !== 'string' || !message.id) {
        throw new Error('Invalid execution broker response identity')
      }
      const request = pending.get(message.id)
      if (!request) return true
      if (message.action === 'event') {
        try {
          request.onEvent(message.event)
        } catch (error) {
          request.failure ??= { error }
          request.onAbort()
        }
        return true
      }
      if (message.action !== 'result' && message.action !== 'error') {
        throw new Error('Invalid execution broker response action')
      }
      pending.delete(message.id)
      request.signal.removeEventListener('abort', request.onAbort)
      if (message.action === 'error') {
        const error = remoteError(message.error)
        request.reject(
          request.failure
            ? new AggregateError(
                [request.failure.error, error],
                'Test reporting and execution failed'
              )
            : error
        )
      } else if (request.failure) {
        request.reject(request.failure.error)
      } else {
        request.resolve(message.result)
      }
      return true
    },
  }
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}
