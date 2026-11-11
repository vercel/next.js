import type {
  CompiledTestArtifact,
  ExecuteTestOptions,
  TestRecordEvent,
} from '../contracts'
import type { TestArtifact } from '../runner/tasks'
import type { TestRecordRequest, TestRecordResponse } from './protocol'

/** The record RPC has one actual ordinary isolated Node file owner. */
export function assertTestRecordRole(
  artifact: CompiledTestArtifact,
  options: Pick<
    ExecuteTestOptions,
    | 'captureTestRecords'
    | 'captureTaskResults'
    | 'entry'
    | 'collectOnly'
    | 'userCancelSignal'
    | 'coverage'
    | 'customCoverage'
    | 'browser'
  >
) {
  if (options.captureTestRecords === undefined) return
  if (
    options.captureTestRecords !== true ||
    options.captureTaskResults !== true ||
    options.collectOnly ||
    options.userCancelSignal ||
    options.coverage ||
    options.customCoverage ||
    options.browser ||
    artifact.kind !== 'node' ||
    artifact.profile.environment !== 'node' ||
    artifact.profile.route !== undefined ||
    artifact.profile.browserClient !== undefined ||
    artifact.cohort ||
    options.entry.typecheck ||
    options.entry.inSource ||
    !/\.(?:js|mjs)$/.test(options.entry.file) ||
    (options.entry.executionEnvironment &&
      options.entry.executionEnvironment.name !== 'node')
  )
    throw new Error(
      'Test record callbacks require one-shot isolated ordinary Node JavaScript execution.'
    )
}

export function assertTestRecordEvent(
  value: unknown,
  identity: { runId: string; entryId: string; revision: string }
): asserts value is TestRecordEvent {
  const event = value as TestRecordEvent
  if (
    !event ||
    typeof event !== 'object' ||
    !['test-annotation', 'test-artifact'].includes(event.type) ||
    event.version !== 1 ||
    event.runId !== identity.runId ||
    event.entryId !== identity.entryId ||
    event.revision !== identity.revision ||
    !Number.isFinite(event.timestamp) ||
    typeof event.caseId !== 'string' ||
    !event.caseId ||
    !event.attempt ||
    typeof event.attempt.id !== 'string' ||
    !event.attempt.id ||
    !Number.isSafeInteger(event.attempt.retry) ||
    event.attempt.retry < 0 ||
    !Number.isSafeInteger(event.attempt.repeat) ||
    event.attempt.repeat < 0 ||
    (event.type === 'test-annotation'
      ? !event.annotation || typeof event.annotation !== 'object'
      : !event.artifact || typeof event.artifact !== 'object')
  )
    throw new Error('Mismatched test record event.')
}

/** Each authored operation keeps its own response while callbacks overlap. */
export function createTestRecordClient(options: {
  identity: { runId: string; entryId: string; revision: string }
  signal: AbortSignal
  send(request: TestRecordRequest): Promise<void>
}) {
  let nextRequestId = 0
  let closed: { reason: unknown } | undefined
  const requests = new Map<
    number,
    {
      promise: Promise<TestArtifact | undefined>
      resolve(value: TestArtifact | undefined): void
      reject(reason: unknown): void
    }
  >()
  const close = (reason: unknown = new Error('Test record owner closed.')) => {
    if (closed) return
    closed = { reason }
    options.signal.removeEventListener('abort', abort)
    for (const request of requests.values()) request.reject(reason)
    requests.clear()
  }
  const abort = () => close(options.signal.reason)
  options.signal.addEventListener('abort', abort, { once: true })
  if (options.signal.aborted) abort()
  return {
    get pending() {
      return requests.size
    },
    record(event: TestRecordEvent): Promise<TestArtifact | undefined> {
      if (closed) return Promise.reject(closed.reason)
      assertTestRecordEvent(event, options.identity)
      const requestId = ++nextRequestId
      if (!Number.isSafeInteger(requestId))
        throw new Error('Test record request identity overflowed.')
      let resolve!: (value: TestArtifact | undefined) => void
      let reject!: (reason: unknown) => void
      const promise = new Promise<TestArtifact | undefined>(
        (resolveRecord, rejectRecord) => {
          resolve = resolveRecord
          reject = rejectRecord
        }
      )
      // A caller may start an artifact without awaiting it. The outer public
      // operation retains its own rejection, while this internal map owns join.
      void promise.catch(() => {})
      requests.set(requestId, { promise, resolve, reject })
      try {
        void options
          .send({ type: 'test-record', requestId, event })
          .catch((reason) => {
            if (requests.delete(requestId)) reject(reason)
          })
      } catch (reason) {
        requests.delete(requestId)
        reject(reason)
      }
      return promise
    },
    receive(message: TestRecordResponse) {
      if (closed) return
      const outcome = message?.outcome
      if (
        !message ||
        message.type !== 'test-recorded' ||
        Object.keys(message).length !== 6 ||
        !['type', 'requestId', 'runId', 'entryId', 'revision', 'outcome'].every(
          (key) => Object.hasOwn(message, key)
        ) ||
        message.runId !== options.identity.runId ||
        message.entryId !== options.identity.entryId ||
        message.revision !== options.identity.revision ||
        !Number.isSafeInteger(message.requestId) ||
        message.requestId < 1 ||
        !requests.has(message.requestId) ||
        !outcome ||
        typeof outcome !== 'object' ||
        Array.isArray(outcome) ||
        Object.keys(outcome).length !== 2 ||
        !Object.hasOwn(outcome, 'kind') ||
        (outcome.kind === 'return'
          ? !Object.hasOwn(outcome, 'value')
          : outcome.kind !== 'throw' || !Object.hasOwn(outcome, 'error'))
      )
        throw new Error('Mismatched test record acknowledgement.')
      const request = requests.get(message.requestId)!
      requests.delete(message.requestId)
      if (outcome.kind === 'return') request.resolve(outcome.value)
      else request.reject(outcome.error)
    },
    async flush() {
      while (requests.size)
        await Promise.allSettled(
          [...requests.values()].map((item) => item.promise)
        )
    },
    close,
  }
}
