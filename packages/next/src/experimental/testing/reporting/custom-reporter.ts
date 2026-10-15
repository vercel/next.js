import { resolve as resolvePath, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runTestProcess } from '../execution/process'
import type { SerializedDiagnostic } from './events'
import type { CustomReporterCompletion } from './custom-reporter-tasks'

/** File-backed JavaScript reporters use their own supervised evaluated realm. */
export function isCustomResultReporter(name: string): boolean {
  return (
    name.startsWith('.') ||
    name.startsWith('/') ||
    /^[A-Za-z]:[/\\]/.test(name) ||
    name.startsWith('file:')
  )
}
function reporterPath(name: string, projectDir: string) {
  const file = name.startsWith('file:')
    ? fileURLToPath(name)
    : resolvePath(projectDir, name)
  if (!['.js', '.mjs', '.cjs'].includes(extname(file)))
    throw new Error(
      'Custom reporter completion adapters currently require a JavaScript .js, .mjs or .cjs module; TypeScript and package adapters remain unimplemented.'
    )
  return file
}
function remoteError(value: SerializedDiagnostic): Error {
  const error = value.errors
    ? new AggregateError(value.errors.map(remoteError), value.message)
    : new Error(
        value.message,
        value.cause ? { cause: remoteError(value.cause) } : undefined
      )
  error.name = value.name ?? 'Error'
  if (value.stack) error.stack = value.stack
  return error
}

export async function openCustomReporters(options: {
  projectDir: string
  reporters: readonly string[]
  signal?: AbortSignal
  write(text: string): void
  writeError?(text: string): void
}) {
  const files = options.reporters.map((name) =>
    reporterPath(name, options.projectDir)
  )
  const controller = new AbortController()
  const abort = () => controller.abort(options.signal?.reason)
  if (options.signal?.aborted) abort()
  else options.signal?.addEventListener('abort', abort, { once: true })
  let send!: (message: object) => Promise<void>
  let pending:
    | {
        resolve(): void
        reject(error: unknown): void
        timer?: ReturnType<typeof setTimeout>
      }
    | undefined
  let closing = false
  let closed = false
  let failure: unknown
  let deliveredFailure: unknown
  let disposal: Promise<void> | undefined
  function response(): Promise<void> {
    return new Promise((resolve, reject) => {
      pending = {
        resolve,
        reject,
        timer: setTimeout(() => {
          const error = new Error('Custom reporter request timed out.')
          failure ??= error
          reject(error)
          controller.abort(error)
        }, 120000),
      }
    })
  }
  const loaded = response()
  const exit = runTestProcess(require.resolve('./custom-reporter-worker'), {
    cwd: options.projectDir,
    env: process.env,
    input: { files, projectDir: options.projectDir },
    signal: controller.signal,
    shutdownGraceMs: 10000,
    onReady(value) {
      send = value
    },
    onMessage(message: any) {
      if (
        message?.type !== 'custom-reporter-result' &&
        message?.type !== 'custom-reporter-failed'
      )
        throw new Error('Invalid custom reporter response.')
      const error =
        message.type === 'custom-reporter-failed'
          ? remoteError(message.error)
          : undefined
      if (error) failure ??= error
      const current = pending
      pending = undefined
      clearTimeout(current?.timer)
      if (!current) {
        failure ??= new Error('Unexpected custom reporter response.')
        controller.abort(failure)
      } else if (error) current.reject(error)
      else current.resolve()
    },
    onOutput(stream, chunk) {
      ;(stream === 'stderr'
        ? (options.writeError ?? options.write)
        : options.write)(chunk.toString())
    },
  }).then(
    (result) => {
      closed = true
      if (
        !(result.reason === 'cancelled' && options.signal?.aborted) &&
        (!closing || result.reason !== 'exit' || result.code !== 0)
      )
        failure ??= new Error(
          `Custom reporter process ended unexpectedly (${result.reason}, code ${result.code}).`
        )
      clearTimeout(pending?.timer)
      pending?.reject(
        failure ??
          options.signal?.reason ??
          new Error('Custom reporter process closed.')
      )
      pending = undefined
    },
    (error) => {
      closed = true
      failure ??= error
      clearTimeout(pending?.timer)
      pending?.reject(error)
      pending = undefined
    }
  )
  async function request(message: object, shutdown = false) {
    if (pending || closed || (closing && !shutdown))
      throw failure ?? new Error('Custom reporter session is unavailable.')
    if (failure && !shutdown) throw failure
    const result = response()
    void send(message).catch((error) => {
      failure ??= error
      clearTimeout(pending?.timer)
      pending?.reject(error)
      pending = undefined
      controller.abort(error)
    })
    try {
      await result
    } catch (error) {
      deliveredFailure = error
      throw error
    }
  }
  function dispose() {
    return (disposal ??= (async () => {
      closing = true
      const cleanupErrors: unknown[] = []
      if (!closed && !controller.signal.aborted) {
        try {
          await request({ type: 'shutdown' }, true)
        } catch (error) {
          cleanupErrors.push(error)
          controller.abort(error)
        }
      }
      await exit
      options.signal?.removeEventListener('abort', abort)
      if (cleanupErrors.length) {
        if (failure && !cleanupErrors.includes(failure))
          cleanupErrors.unshift(failure)
        if (cleanupErrors.length === 1) throw cleanupErrors[0]
        throw new AggregateError(
          cleanupErrors,
          'Custom reporter cleanup failed.'
        )
      }
      if (failure && failure !== deliveredFailure) throw failure
    })())
  }
  try {
    await loaded
    return {
      finish: (completion: CustomReporterCompletion) =>
        request({ type: 'finish', completion }),
      dispose,
    }
  } catch (error) {
    deliveredFailure = error
    try {
      await dispose()
    } catch (cleanupError) {
      if (cleanupError !== error)
        throw new AggregateError(
          [error, cleanupError],
          'Custom reporter initialization and cleanup failed.'
        )
    }
    throw error
  }
}
