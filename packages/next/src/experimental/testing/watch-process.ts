import { fork } from 'child_process'
import { randomUUID } from 'crypto'
import { mkdir, mkdtemp, rm } from 'fs/promises'
import { join, isAbsolute } from 'path'
import type { DiscoveredTestProject } from './discovery'
import type { TestProfile } from './contracts'
import type { WatchDirectories } from './incremental/watch-files'
import type { runTests } from './orchestrator'
import type { ResultEvent } from './reporting/events'
import {
  createTestReporter,
  type TestReporterOptions,
} from './reporting/reporter'
import { serializeDiagnostic } from './reporting/diagnostics'
import {
  commitSnapshotUpdates,
  type SnapshotUpdate,
} from './assertions/snapshots'

export type WatchProcessRequest =
  | { operation: 'metadata'; projectDir: string; profiles: TestProfile[] }
  | {
      operation: 'run'
      projectDir: string
      projects: DiscoveredTestProject[]
      testNamePattern?: string
      updateSnapshots?: boolean
    }

export type WatchProcessResult =
  | { operation: 'metadata'; directories: WatchDirectories }
  | { operation: 'run'; result: Awaited<ReturnType<typeof runTests>> }

export type WatchProcessMessage =
  | { type: 'result'; value: WatchProcessResult }
  | { type: 'error'; message: string }
  | { type: 'event'; event: ResultEvent }

export interface ArtifactAllocationRequest {
  type: 'artifact-allocation-request'
  id: string
  parentDir: string
}

export interface ArtifactAllocationResponse {
  type: 'artifact-allocation-response'
  id: string
  allocation?: { stagingDir: string; rootDir: string }
  error?: string
}

/** A failed ownership check must never be treated as recoverable configuration. */
export class WatchOwnershipError extends Error {
  constructor(cause: unknown) {
    super(
      'Watch generation cleanup failed; output ownership cannot be reused.',
      { cause }
    )
    this.name = 'WatchOwnershipError'
  }
}

async function closeGenerationGroup(pid: number) {
  const signal = (value: NodeJS.Signals | 0) => {
    try {
      process.kill(-pid, value)
      return true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false
      throw error
    }
  }
  if (!signal('SIGTERM')) return
  const started = Date.now()
  while (signal(0)) {
    if (Date.now() - started > 1000) signal('SIGKILL')
    if (Date.now() - started > 5000) {
      throw new Error('Watch generation process group did not close.')
    }
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

/**
 * Fresh normal Next config/env/module caches per invocation. Resolve only after
 * child exit, so a passing payload followed by a process failure cannot pass.
 * Cancellation first cooperates, then the parent reclaims its owned generation
 * group after file-worker closure. Nothing is detached from cleanup ownership.
 */
export async function runWatchProcess(
  request: WatchProcessRequest,
  options: {
    signal: AbortSignal
    write(text: string): void
    reporter?: Omit<TestReporterOptions, 'write' | 'projectDir' | 'fileCount'>
    onEvent?: (event: ResultEvent) => void
    onSnapshotCommitStart?: () => void
    onSnapshotCommitEnd?: () => void
  }
): Promise<WatchProcessResult> {
  if (process.platform === 'win32')
    throw new Error('Test watch requires POSIX process ownership.')
  options.signal.throwIfAborted()
  const brokerModule =
    request.operation === 'run'
      ? await import('./execution/broker.js')
      : undefined
  options.signal.throwIfAborted()
  let disposeReporter: (() => void) | undefined
  return new Promise<WatchProcessResult>((resolve, reject) => {
    const child = fork(require.resolve('./watch-worker'), [], {
      cwd: request.projectDir,
      env: { ...process.env },
      execArgv: [],
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    })
    let message: WatchProcessMessage | undefined
    let failure: unknown
    let failed = false
    let ownership: Promise<void> | undefined
    let abortTimer: NodeJS.Timeout | undefined
    let outputTimer: NodeJS.Timeout | undefined
    let terminalTimer: NodeJS.Timeout | undefined
    let exited = false
    let ownershipFailed = false
    let forcedCancellation = false
    const artifactDirectories = new Set<string>()
    const allocations = new Set<Promise<void>>()
    const reporter =
      request.operation === 'run'
        ? createTestReporter({
            ...options.reporter,
            projectDir: request.projectDir,
            fileCount: request.projects.reduce(
              (total, project) => total + project.entries.length,
              0
            ),
            watch: true,
            write: options.write,
            onError(error) {
              fail(error)
              cancel()
              options.reporter?.onError?.(error)
            },
          })
        : undefined
    disposeReporter = reporter?.dispose
    const snapshotPlans = new Map<
      string,
      { file: string; updates: SnapshotUpdate[] }
    >()
    const emitResult = (event: ResultEvent) => {
      options.onEvent?.(event)
      reporter?.onEvent(event)
    }
    const began = performance.now()
    let runId: string | undefined
    let runEnd: Extract<ResultEvent, { type: 'run-end' }> | undefined
    const startedFiles = new Set<string>()
    const endedFiles = new Set<string>()
    const fail = (error: unknown) => {
      failed = true
      failure ??= error
    }
    const broker = brokerModule?.createExecutionBrokerHost({
      signal: options.signal,
      onSnapshotUpdates:
        request.operation === 'run' && request.updateSnapshots
          ? async (entryId, file, updates) => {
              const entry = request.projects
                .flatMap((project) => project.entries)
                .find((candidate) => candidate.id === entryId)
              if (!entry || entry.file !== file || snapshotPlans.has(entryId)) {
                throw new Error('Invalid watch snapshot update identity.')
              }
              snapshotPlans.set(entryId, {
                file,
                updates: structuredClone(updates),
              })
            }
          : undefined,
      send: (response) =>
        new Promise<void>((sent, rejected) => {
          if (!child.connected)
            return rejected(new Error('Watch generation disconnected.'))
          child.send(response, (error) => (error ? rejected(error) : sent()))
        }),
    })
    const closeOwnership = () =>
      (ownership ??= (async () => {
        const errors: unknown[] = []
        let readersClosed = !broker
        let groupClosed = false
        try {
          await broker?.close()
          readersClosed = true
        } catch (error) {
          errors.push(error)
          readersClosed = broker?.ownershipClosed === true
        }
        try {
          if (child.pid) await closeGenerationGroup(child.pid)
          groupClosed = true
        } catch (error) {
          errors.push(error)
        }
        await Promise.all(allocations)
        // Do not delete immutable inputs while a failed supervisor cannot
        // certify that its readers are gone. This run cannot be reused.
        if (readersClosed && groupClosed) {
          const removals = await Promise.allSettled(
            [...artifactDirectories].map((directory) =>
              rm(directory, { recursive: true, force: true })
            )
          )
          for (const removal of removals)
            if (removal.status === 'rejected') {
              ownershipFailed = true
              errors.push(removal.reason)
            }
        } else ownershipFailed = true
        if (errors.length)
          throw new AggregateError(
            errors,
            'Watch generation cleanup failed; output ownership cannot be reused.'
          )
      })().catch((error) => {
        fail(error)
      }))
    const boundTerminalExit = () => {
      if (exited) return
      terminalTimer ??= setTimeout(() => {
        fail(
          new Error(
            'Watch process did not exit after completing or disconnecting.'
          )
        )
        void closeOwnership()
      }, 1000)
    }
    const cancel = () => {
      if (child.connected)
        child.send({ type: 'cancel' }, (error) => {
          if (error) fail(error)
        })
      // Give normal finally blocks a chance, then reclaim the same owned groups.
      // Broker closure precedes compiler termination so artifact readers finish.
      abortTimer ??= setTimeout(() => {
        forcedCancellation = options.signal.aborted
        void closeOwnership()
      }, 5000)
    }
    const write = (data: Buffer, stream: 'stdout' | 'stderr') => {
      try {
        const target = options.reporter?.terminal
          ? (text: string) => options.reporter!.terminal!.write(text, stream)
          : stream === 'stderr'
            ? (options.reporter?.writeError ?? options.write)
            : options.write
        target(data.toString())
      } catch (error) {
        fail(error)
        cancel()
      }
    }
    child.stdout!.on('data', (data) => write(data, 'stdout'))
    child.stderr!.on('data', (data) => write(data, 'stderr'))
    child.on('error', fail)
    child.on(
      'message',
      (value: WatchProcessMessage | ArtifactAllocationRequest) => {
        try {
          if (broker?.handle(value)) return
        } catch (error) {
          fail(error)
          cancel()
          return
        }
        if (value?.type === 'event') {
          try {
            const event = value.event
            if (!reporter)
              throw new Error('Metadata process sent execution events.')
            if (event.type === 'run-start') runId = event.runId
            if (event.type === 'file-start') startedFiles.add(event.entry.id)
            if (event.type === 'file-end') endedFiles.add(event.entryId)
            if (event.type === 'run-end') {
              if (runEnd)
                throw new Error('Watch process sent duplicate run-end events.')
              runEnd = event
            } else emitResult(event)
          } catch (error) {
            fail(error)
            cancel()
          }
          return
        }
        if (value?.type === 'artifact-allocation-request') {
          const allocation = (async () => {
            const response: ArtifactAllocationResponse = {
              type: 'artifact-allocation-response',
              id: value.id,
            }
            try {
              if (
                request.operation !== 'run' ||
                ownership ||
                !isAbsolute(value.parentDir)
              )
                throw new Error('Invalid watch artifact allocation request.')
              await mkdir(value.parentDir, { recursive: true })
              const stagingDir = await mkdtemp(
                join(value.parentDir, '.next-test-pending-')
              )
              const rootDir = join(
                value.parentDir,
                `.next-test-${randomUUID()}`
              )
              artifactDirectories.add(stagingDir)
              artifactDirectories.add(rootDir)
              response.allocation = { stagingDir, rootDir }
            } catch (error) {
              response.error =
                error instanceof Error
                  ? error.message
                  : 'Watch artifact allocation failed.'
            }
            if (child.connected)
              await new Promise<void>((sent) =>
                child.send(response, (error) => {
                  if (error) fail(error)
                  sent()
                })
              )
          })().catch(fail)
          allocations.add(allocation)
          void allocation.finally(() => allocations.delete(allocation))
          return
        }
        if (
          !value ||
          typeof value !== 'object' ||
          (value.type !== 'error' && value.type !== 'result') ||
          (value.type === 'error' && typeof value.message !== 'string') ||
          (value.type === 'result' &&
            (!value.value || value.value.operation !== request.operation))
        ) {
          fail(new Error('Watch process sent an invalid terminal message.'))
          cancel()
          return
        }
        if (message)
          fail(new Error('Watch process sent duplicate terminal messages.'))
        else {
          message = value
          boundTerminalExit()
        }
      }
    )
    child.once('disconnect', boundTerminalExit)
    child.once('exit', () => {
      exited = true
      if (terminalTimer) clearTimeout(terminalTimer)
      void closeOwnership()
      // An intentionally detached descendant must not retain this lease merely
      // by inheriting stdout/stderr. Ordinary descendants are group-owned above.
      outputTimer = setTimeout(() => {
        child.stdout!.destroy()
        child.stderr!.destroy()
      }, 1000)
    })
    child.once('close', async (code, signal) => {
      if (abortTimer) clearTimeout(abortTimer)
      if (outputTimer) clearTimeout(outputTimer)
      if (terminalTimer) clearTimeout(terminalTimer)
      options.signal.removeEventListener('abort', cancel)
      await closeOwnership()
      if (
        !failed &&
        (code !== 0 || signal) &&
        !(forcedCancellation && (signal === 'SIGTERM' || signal === 'SIGKILL'))
      )
        fail(
          new Error(
            `Watch process failed to close successfully (${signal ?? code}).`
          )
        )
      if (!failed && !options.signal.aborted) {
        if (!message) fail(new Error('Watch process closed without a result.'))
        else if (message.type === 'error') fail(new Error(message.message))
        else if (
          message.type !== 'result' ||
          message.value.operation !== request.operation
        )
          fail(new Error('Watch process returned an invalid result.'))
      }
      // A snapshot shortcut is a single explicit transaction. Provisional file
      // success is insufficient: the compiler generation and every owned reader
      // must have exited cleanly before the parent writes any staged bytes.
      if (
        !failed &&
        !options.signal.aborted &&
        request.operation === 'run' &&
        request.updateSnapshots &&
        runEnd?.status === 'passed' &&
        message?.type === 'result' &&
        message.value.operation === 'run' &&
        message.value.result.status === 'passed' &&
        !message.value.result.unsafeCleanup
      ) {
        try {
          options.onSnapshotCommitStart?.()
          for (const { file, updates } of snapshotPlans.values()) {
            await commitSnapshotUpdates(file, updates, {
              signal: options.signal,
            })
          }
        } catch (error) {
          fail(error)
        } finally {
          try {
            options.onSnapshotCommitEnd?.()
          } catch (error) {
            fail(error)
          }
        }
      }
      if (reporter && request.operation === 'run') {
        try {
          const envelope = {
            version: 1 as const,
            runId: runId ?? randomUUID(),
            timestamp: Date.now(),
          }
          if (!runId) emitResult({ ...envelope, type: 'run-start' })
          if (failed)
            emitResult({
              ...envelope,
              type: 'diagnostic',
              diagnostic: serializeDiagnostic(failure, { phase: 'runtime' }),
            })
          if (!runEnd && !failed && !options.signal.aborted) {
            fail(
              new Error('Watch process closed without a terminal run event.')
            )
            emitResult({
              ...envelope,
              type: 'diagnostic',
              diagnostic: serializeDiagnostic(failure, { phase: 'runtime' }),
            })
          }
          for (const project of request.projects)
            for (const entry of project.entries) {
              if (endedFiles.has(entry.id)) continue
              if (!startedFiles.has(entry.id))
                emitResult({ ...envelope, type: 'file-start', entry })
              emitResult({
                ...envelope,
                type: 'file-end',
                entryId: entry.id,
                status: failed ? 'failed' : 'cancelled',
                durationMs: performance.now() - began,
              })
            }
          emitResult({
            ...envelope,
            type: 'run-end',
            status:
              failed || runEnd?.status === 'failed'
                ? 'failed'
                : options.signal.aborted
                  ? 'cancelled'
                  : runEnd!.status,
            durationMs: performance.now() - began,
          })
          if (message?.type === 'result' && message.value.operation === 'run')
            message.value.result = {
              ...reporter.getSummary(),
              unsafeCleanup: message.value.result.unsafeCleanup,
            }
        } catch (error) {
          fail(error)
        }
      }
      if (failed)
        reject(ownershipFailed ? new WatchOwnershipError(failure) : failure)
      else if (options.signal.aborted) reject(options.signal.reason)
      else if (message?.type === 'result') resolve(message.value)
      else reject(new Error('Watch process returned no result.'))
    })
    options.signal.addEventListener('abort', cancel, { once: true })
    child.send({ type: 'start', request }, (error) => {
      if (error) fail(error)
      if (options.signal.aborted) cancel()
    })
  }).finally(() => {
    disposeReporter?.()
  })
}
