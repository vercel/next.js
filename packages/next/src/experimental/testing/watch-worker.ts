import type {
  ArtifactAllocationResponse,
  WatchProcessMessage,
  WatchProcessRequest,
  WatchProcessResult,
} from './watch-process'
import { randomUUID } from 'crypto'
import type { WatchDirectories } from './incremental/watch-files'

const controller = new AbortController()
let started = false
const allocations = new Map<
  string,
  {
    resolve(value: { stagingDir: string; rootDir: string }): void
    reject(error: Error): void
  }
>()
let broker:
  | ReturnType<typeof import('./execution/broker').createExecutionBrokerClient>
  | undefined

async function run(request: WatchProcessRequest): Promise<WatchProcessResult> {
  if (request.operation === 'run') {
    const { createExecutionBrokerClient } = await import(
      './execution/broker.js'
    )
    broker = createExecutionBrokerClient({
      send: (message) =>
        new Promise<void>((sent, failed) => {
          if (!process.connected)
            return failed(new Error('Test watch coordinator disconnected.'))
          process.send!(message, (error: Error | null) =>
            error ? failed(error) : sent()
          )
        }),
    })
    const { runTests } = await import('./orchestrator.js')
    const result = await runTests(request.projectDir, request.projects, {
      signal: controller.signal,
      execute: broker.execute,
      allocateArtifact: (parentDir) =>
        new Promise((resolve, reject) => {
          const id = randomUUID()
          allocations.set(id, { resolve, reject })
          if (!process.connected) {
            allocations.delete(id)
            reject(new Error('Test watch coordinator disconnected.'))
            return
          }
          process.send!(
            { type: 'artifact-allocation-request', id, parentDir },
            (error: Error | null) => {
              if (error) {
                allocations.delete(id)
                reject(error)
              }
            }
          )
        }),
      write: () => {},
      onEvent: (event) => {
        if (!process.connected)
          throw new Error('Test watch coordinator disconnected.')
        process.send!({ type: 'event', event }, (error: Error | null) => {
          if (error) {
            process.exitCode = 1
            controller.abort(error)
          }
        })
      },
    })
    return { operation: 'run', result }
  }
  const modes = new Set(request.profiles.map((profile) => profile.mode))
  if (modes.size !== 1) throw new Error('Watch requires one compilation mode.')
  const mode = request.profiles[0].mode
  if (process.env.NODE_ENV && process.env.NODE_ENV !== mode) {
    throw new Error(
      `Selected test projects require NODE_ENV=${mode}; the current NODE_ENV conflicts with their Next compilation profile.`
    )
  }
  ;(process.env as any).NODE_ENV = mode
  const { resolveTestWatchOptions } = await import(
    './compiler/watch-options.js'
  )
  const directories: WatchDirectories = {
    directories: [],
    outputDirectories: [],
    artifactDirectories: [],
  }
  for (const profile of request.profiles) {
    controller.signal.throwIfAborted()
    const metadata = await resolveTestWatchOptions(request.projectDir, profile)
    directories.directories = [...directories.directories, ...metadata.roots]
    directories.outputDirectories = [
      ...directories.outputDirectories,
      metadata.outputDir,
    ]
    directories.artifactDirectories = [
      ...directories.artifactDirectories!,
      {
        parentDirectory: metadata.artifactParentDir,
        basenamePrefixes: metadata.artifactBasenamePrefixes,
      },
    ]
  }
  return { operation: 'metadata', directories }
}

function finish(message: WatchProcessMessage) {
  process.removeListener('message', onMessage)
  if (process.connected)
    process.send!(message, (error: Error | null) => {
      if (error) process.exitCode = 1
      if (process.connected) process.disconnect()
    })
  else process.exitCode = 1
}

function onMessage(
  message:
    | { type: 'cancel' }
    | { type: 'start'; request: WatchProcessRequest }
    | ArtifactAllocationResponse
) {
  if (broker?.handle(message)) return
  if (message.type === 'artifact-allocation-response') {
    const pending = allocations.get(message.id)
    if (!pending) return
    allocations.delete(message.id)
    if (message.error || !message.allocation)
      pending.reject(
        new Error(message.error ?? 'Missing watch artifact allocation.')
      )
    else pending.resolve(message.allocation)
    return
  }
  if (message.type === 'cancel') {
    controller.abort(new Error('Test watch generation cancelled.'))
    return
  }
  if (started) return
  started = true
  void run(message.request).then(
    (value) => finish({ type: 'result', value }),
    (error: unknown) =>
      finish({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Unknown watch process failure.',
      })
  )
}

process.on('message', onMessage)
process.once('disconnect', () => {
  const error = new Error('Test watch coordinator disconnected.')
  controller.abort(error)
  broker?.disconnect(error)
  for (const pending of allocations.values()) pending.reject(error)
  allocations.clear()
})
