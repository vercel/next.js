import { randomUUID } from 'node:crypto'
import { isAbsolute } from 'node:path'
import type { TestProcessOptions, TestProcessExit } from './process'
import { runTestProcess } from './process'
import { assertArtifactProfile } from './artifact-profile'
import { assertTestFileCollection } from './collection'
import { assertCoverageCompletion } from './coverage'
import type { ResultEvent } from '../reporting/events'
import type {
  WorkerInput,
  WorkerLeaseInput,
  WorkerLeaseMessage,
  WorkerLeaseRequest,
  WorkerFileCompletion,
} from './protocol'

const certifiedFailures = new WeakSet<object>()

class WorkerLeaseClosedError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause), { cause })
    this.name = 'WorkerLeaseClosedError'
    certifiedFailures.add(this)
  }
}

/** A local parent certificate; serialized names and flags cannot reproduce it. */
export function isWorkerLeaseClosedError(error: unknown): error is Error {
  return !!error && typeof error === 'object' && certifiedFailures.has(error)
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  // The lease installs its process listener before consumers await readiness.
  void promise.catch(() => {})
  return { promise, resolve, reject }
}

function timeout(value: number) {
  if (!Number.isFinite(value) || value < 0 || value > 2147483647)
    throw new Error('Invalid persistent worker deadline.')
  return value
}

/**
 * Sequential IPC lease for one compiler-owned shared immutable module cohort.
 * A file acknowledgement permits scheduling the next file, never publication.
 */
export async function createTestWorkerLease(
  workerPath: string,
  options: Pick<
    TestProcessOptions,
    'cwd' | 'env' | 'inspect' | 'signal' | 'shutdownGraceMs' | 'onOutput'
  > & {
    input: WorkerLeaseInput
    startupTimeoutMs?: number
    finishTimeoutMs?: number
    onEvent?(event: ResultEvent): void
    /** Execution cache/runtime resources remain retained until actual exit.
     * The outer compiler owner still retains source maps for staging returned facts. */
    release(): Promise<void>
  }
) {
  const input = structuredClone(options.input)
  if (
    input.version !== 1 ||
    !input.leaseId ||
    !input.runId ||
    !isAbsolute(input.rootDir) ||
    !input.revision
  )
    throw new Error('Invalid persistent worker identity.')
  const startupTimeout = timeout(options.startupTimeoutMs ?? 10000)
  const finishTimeout = timeout(options.finishTimeoutMs ?? 10000)
  const controller = new AbortController()
  const ready = deferred<void>()
  const releases: (() => Promise<void>)[] = [options.release]
  const completions: WorkerFileCompletion[] = []
  const completed = new Map<number, WorkerInput>()
  const completionByRequest = new Map<number, WorkerFileCompletion>()
  let active:
    | {
        id: number
        input: WorkerInput
        done: ReturnType<typeof deferred<void>>
      }
    | undefined
  let send: ((message: WorkerLeaseRequest) => Promise<void>) | undefined
  let nextId = 0
  let readySeen = false
  let finished = false
  let finishing = false
  let finishToken: string | undefined
  let processOwnershipClosed = false
  let retainedOwnershipClosed = false
  let refusedReleaseFailed = false
  const ownershipClosed = () =>
    processOwnershipClosed && retainedOwnershipClosed && !refusedReleaseFailed
  let fatal: unknown
  let queue: Promise<void> = Promise.resolve()
  let finishPromise: Promise<readonly WorkerFileCompletion[]> | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const abortListeners: (() => void)[] = []
  const poison = (error: unknown) => {
    fatal ??= error instanceof Error ? error : new Error(String(error))
    ready.reject(fatal)
    active?.done.reject(fatal)
    controller.abort(fatal)
  }
  const deadline = (milliseconds: number, phase: string) => {
    clearTimeout(timer)
    timer = setTimeout(
      () =>
        poison(new Error(`Persistent worker ${phase} exceeded its deadline.`)),
      milliseconds
    )
  }
  const observeAbort = (signal: AbortSignal | undefined) => {
    if (!signal) return
    const abort = () => poison(signal.reason ?? new Error('Worker cancelled.'))
    if (signal.aborted) abort()
    else {
      signal.addEventListener('abort', abort, { once: true })
      abortListeners.push(() => signal.removeEventListener('abort', abort))
    }
  }
  observeAbort(options.signal)
  deadline(startupTimeout, 'startup')
  const processExit = runTestProcess(workerPath, {
    cwd: options.cwd,
    env: options.env,
    inspect: options.inspect,
    shutdownGraceMs: options.shutdownGraceMs,
    input,
    signal: controller.signal,
    onReady(transport) {
      send = transport
    },
    onOutput(stream, chunk) {
      try {
        options.onOutput?.(stream, chunk)
      } catch (error) {
        poison(error)
        throw error
      }
    },
    onMessage(value) {
      try {
        if (!value || typeof value !== 'object')
          throw new Error('Invalid persistent worker message.')
        const message = value as WorkerLeaseMessage
        if (message.leaseId !== input.leaseId || finished)
          throw new Error('Mismatched or closed persistent worker identity.')
        if (message.type === 'worker-ready') {
          if (readySeen || active || nextId)
            throw new Error('Duplicate persistent worker readiness.')
          readySeen = true
          clearTimeout(timer)
          ready.resolve()
          return
        }
        if (message.type === 'worker-complete') {
          if (
            !finishToken ||
            message.finishToken !== finishToken ||
            active ||
            !readySeen
          )
            throw new Error('Premature persistent worker completion.')
          const attached = new Set<number>()
          if (message.snapshotUpdates !== undefined) {
            if (!Array.isArray(message.snapshotUpdates))
              throw new Error('Invalid final worker snapshot attachments.')
            for (const attachment of message.snapshotUpdates) {
              const origin = completed.get(attachment.requestId)
              const completion = completionByRequest.get(attachment.requestId)
              if (
                !origin ||
                !completion ||
                attached.has(attachment.requestId) ||
                !origin.options.updateSnapshots ||
                completion.result.status !== 'passed' ||
                completion.snapshotUpdates !== undefined ||
                !Array.isArray(attachment.updates)
              )
                throw new Error(
                  'Unsolicited or duplicate final worker snapshots.'
                )
              const paths = new Set<string>()
              for (const update of attachment.updates) {
                if (
                  !update ||
                  typeof update.path !== 'string' ||
                  !isAbsolute(update.path) ||
                  (update.content !== null &&
                    typeof update.content !== 'string') ||
                  (update.previousContent !== null &&
                    typeof update.previousContent !== 'string') ||
                  paths.has(update.path)
                )
                  throw new Error('Invalid final worker snapshot bytes.')
                paths.add(update.path)
              }
              attached.add(attachment.requestId)
              completion.snapshotUpdates = structuredClone(attachment.updates)
            }
          }
          for (const [requestId, origin] of completed) {
            if (
              origin.artifact.kind === 'node' &&
              origin.artifact.cohort &&
              origin.options.updateSnapshots &&
              completionByRequest.get(requestId)!.result.status === 'passed' &&
              completionByRequest.get(requestId)!.snapshotUpdates === undefined
            )
              throw new Error(
                'Shared cohort omitted its final staged snapshots.'
              )
          }
          finished = true
          return
        }
        if (message.type !== 'file-message' || !readySeen)
          throw new Error('Invalid persistent worker protocol phase.')
        const origin =
          message.requestId === active?.id
            ? active.input
            : completed.get(message.requestId)
        if (!origin) throw new Error('Unknown persistent worker file owner.')
        const payload = message.message
        if (payload?.type === 'event') {
          const event = payload.event
          if (
            event.version !== 1 ||
            event.type === 'file-end' ||
            event.runId !== input.runId ||
            !('entryId' in event) ||
            event.entryId !== origin.artifact.entryId ||
            !('revision' in event) ||
            event.revision !== origin.artifact.revision
          )
            throw new Error('Mismatched persistent worker file event.')
          if (
            origin.options.collectOnly &&
            event.type !== 'output' &&
            event.type !== 'diagnostic'
          )
            throw new Error('Collection worker returned execution facts.')
          options.onEvent?.(event)
          if (
            event.type === 'diagnostic' &&
            event.diagnostic.phase === 'cleanup'
          )
            poison(new Error('Persistent worker file cleanup failed.'))
          if (message.requestId !== active?.id)
            poison(new Error('Late event from a completed worker file owner.'))
          return
        }
        if (payload?.type !== 'complete' || message.requestId !== active?.id)
          throw new Error(
            'Duplicate or stale persistent worker file completion.'
          )
        if (
          payload.result?.entryId !== origin.artifact.entryId ||
          !['passed', 'failed', 'cancelled'].includes(payload.result.status) ||
          !Number.isFinite(payload.result.durationMs) ||
          payload.result.durationMs < 0
        )
          throw new Error('Invalid persistent worker file result.')
        if (payload.snapshotUpdates !== undefined) {
          if (
            (origin.artifact.kind === 'node' && origin.artifact.cohort) ||
            !origin.options.updateSnapshots ||
            !Array.isArray(payload.snapshotUpdates)
          )
            throw new Error('Unsolicited persistent worker snapshot updates.')
        }
        if (payload.coverage !== undefined) {
          if (!origin.options.coverage)
            throw new Error('Unsolicited persistent worker coverage.')
          assertCoverageCompletion(
            payload.coverage,
            origin.artifact,
            input.runId
          )
        }
        if (payload.collection !== undefined) {
          if (!origin.options.collectOnly)
            throw new Error('Unsolicited persistent worker collection.')
          assertTestFileCollection(payload.collection, origin.artifact)
        }
        if (
          origin.options.collectOnly &&
          payload.result.status === 'passed' &&
          !payload.collection
        )
          throw new Error('Persistent collection has no collected facts.')
        if (message.reusable !== true)
          poison(
            new Error('Persistent worker did not close its file owner cleanly.')
          )
        if (payload.result.status === 'cancelled')
          poison(new Error('Persistent worker file was interrupted.'))
        if (payload.coverage && !payload.coverage.complete)
          poison(new Error('Persistent worker coverage is incomplete.'))
        const completion = structuredClone(payload)
        completions.push(completion)
        completionByRequest.set(active.id, completion)
        completed.set(active.id, origin)
        const done = active.done
        active = undefined
        clearTimeout(timer)
        done.resolve()
      } catch (error) {
        poison(error)
        throw error
      }
    },
  })
  // This promise always settles after process/group/output AND retained resources.
  const closed = (async () => {
    const failures: unknown[] = []
    let exit: TestProcessExit | undefined
    try {
      exit = await processExit
      // Process failure/cancellation still certifies parent ownership when the
      // process helper has closed its entire group and output successfully.
      processOwnershipClosed = true
      if (!finished || exit.reason !== 'exit' || exit.code !== 0 || fatal)
        throw (
          fatal ??
          new Error('Persistent worker exited without clean completion.')
        )
    } catch (error) {
      failures.push(error)
      poison(error)
    } finally {
      clearTimeout(timer)
      for (const remove of abortListeners) remove()
      let releaseFailed = false
      for (const release of releases.reverse()) {
        try {
          await release()
        } catch (error) {
          releaseFailed = true
          failures.push(error)
        }
      }
      retainedOwnershipClosed = !releaseFailed
    }
    if (failures.length === 1) throw failures[0]
    if (failures.length)
      throw new AggregateError(
        failures,
        'Persistent worker and resource cleanup failed.'
      )
    return exit!
  })()
  void closed.catch(() => {})
  const finish = () => {
    if (finishPromise) return finishPromise
    finishing = true
    finishPromise = (async () => {
      try {
        await ready.promise
        await queue
        if (fatal) throw fatal
        deadline(finishTimeout, 'cleanup')
        finishToken = randomUUID()
        await send!({
          type: 'finish-worker',
          leaseId: input.leaseId,
          finishToken,
        })
      } catch (error) {
        poison(error)
      }
      await closed
      return completions
    })()
    return finishPromise
  }
  try {
    await ready.promise
  } catch (error) {
    try {
      await closed
    } catch (failure) {
      if (ownershipClosed()) throw new WorkerLeaseClosedError(failure)
      throw failure
    }
    throw error
  }
  return {
    get ownershipClosed() {
      return ownershipClosed()
    },
    /** Takes ownership of release even when the request is refused.
     * Resolves only to permit the next request; all facts remain private. */
    enqueue(
      fileInput: WorkerInput,
      release: () => Promise<void>,
      signal?: AbortSignal
    ) {
      if (finishing || fatal) {
        const closing = new Error('Persistent worker lease is closing.')
        return (async () => {
          // This input was never sent to the child. Its newly transferred cache
          // is safe to release immediately, even while the retired lease closes.
          try {
            await release()
          } catch (error) {
            refusedReleaseFailed = true
            throw new AggregateError(
              [closing, error],
              'Rejected worker request cleanup failed.'
            )
          }
          throw closing
        })()
      }
      releases.push(release)
      observeAbort(signal)
      let owned: WorkerInput
      try {
        owned = structuredClone(fileInput)
      } catch (error) {
        poison(error)
        return closed.then(() => {})
      }
      const id = nextId++
      const task = queue.then(async () => {
        if (fatal) throw fatal
        assertArtifactProfile(owned.artifact, owned.options.entry)
        if (
          owned.artifact.rootDir !== input.rootDir ||
          owned.artifact.revision !== input.revision ||
          JSON.stringify(owned.artifact.profile) !==
            JSON.stringify(input.profile) ||
          owned.options.runId !== input.runId
        )
          throw new Error(
            'Persistent worker requires one immutable compiler cohort.'
          )
        const done = deferred<void>()
        active = { id, input: owned, done }
        deadline(timeout(owned.options.fileTimeout ?? 30000), 'file')
        await send!({
          type: 'file',
          leaseId: input.leaseId,
          requestId: id,
          input: owned,
        })
        await done.promise
      })
      queue = task.catch((error) => {
        poison(error)
      })
      return task.catch(async () => {
        await closed
      })
    },
    finish,
    abort(error: unknown) {
      poison(error)
      return finish()
    },
  }
}
