import { isDeepStrictEqual } from 'node:util'
import type { TestRecordEvent } from '../contracts'
import type { ResultEvent } from '../reporting/events'

/** Private wrapper identity follows only the exact synchronous compiler event. */
export function createTestRecordForwarder() {
  const records = new WeakMap<TestRecordEvent, string>()
  return {
    forward(recordId: string, event: TestRecordEvent, deliver: () => void) {
      if (!recordId || records.has(event))
        throw new Error('Invalid test record forwarding scope.')
      records.set(event, recordId)
      try {
        deliver()
      } finally {
        records.delete(event)
      }
    },
    id(event: ResultEvent) {
      if (event.type === 'test-annotation' || event.type === 'test-artifact')
        return records.get(event)
    },
  }
}

/** Resolve only after the actual collector receives the compiler-forwarded copy. */
export function createTestRecordReceipts(signal: AbortSignal) {
  let closed: { reason: unknown } | undefined
  const receipts = new Map<
    string,
    {
      expected: TestRecordEvent
      received: boolean
      resolve(event: TestRecordEvent): void
      reject(reason: unknown): void
    }
  >()
  const cancelled = new Map<string, TestRecordEvent>()
  const seen = new Set<string>()
  const close = (reason: unknown) => {
    if (closed) return
    closed = { reason }
    signal.removeEventListener('abort', abort)
    for (const receipt of receipts.values()) receipt.reject(reason)
    receipts.clear()
    cancelled.clear()
    seen.clear()
  }
  const abort = () => close(signal.reason)
  signal.addEventListener('abort', abort, { once: true })
  if (signal.aborted) abort()
  return {
    get pending() {
      return receipts.size
    },
    wait(
      recordId: string,
      expected: TestRecordEvent,
      workerSignal: AbortSignal
    ): Promise<TestRecordEvent> {
      if (closed) return Promise.reject(closed.reason)
      if (!recordId || seen.has(recordId))
        throw new Error('Duplicate test record forwarding identity.')
      seen.add(recordId)
      if (workerSignal.aborted) {
        cancelled.set(recordId, expected)
        return Promise.reject(workerSignal.reason)
      }
      let reject!: (reason: unknown) => void
      const received = new Promise<TestRecordEvent>(
        (resolve, rejectReceived) => {
          reject = rejectReceived
          receipts.set(recordId, {
            expected,
            received: false,
            resolve,
            reject,
          })
        }
      )
      const cancelWorker = () => {
        const receipt = receipts.get(recordId)
        if (receipt && !receipt.received) {
          cancelled.set(recordId, expected)
          receipts.delete(recordId)
        }
        reject(workerSignal.reason)
      }
      workerSignal.addEventListener('abort', cancelWorker, { once: true })
      // The worker can close before the record gets back from its compiler.
      if (workerSignal.aborted) cancelWorker()
      return received.finally(() => {
        workerSignal.removeEventListener('abort', cancelWorker)
        receipts.delete(recordId)
      })
    },
    receive(recordId: string, event: TestRecordEvent, deliver: () => void) {
      if (closed) throw closed.reason
      const abandoned = cancelled.get(recordId)
      if (abandoned) {
        if (!isDeepStrictEqual(event, abandoned))
          throw new Error(
            'Mismatched cancelled test record forwarding receipt.'
          )
        // This is still a real compiler-forwarded event. Its file's API waiter
        // has closed, so retain normal observers without starting its callback.
        cancelled.delete(recordId)
        deliver()
        return
      }
      const receipt = receipts.get(recordId)
      if (
        !receipt ||
        receipt.received ||
        !isDeepStrictEqual(event, receipt.expected)
      )
        throw new Error('Mismatched test record forwarding receipt.')
      receipt.received = true
      try {
        deliver()
      } catch (error) {
        receipt.reject(error)
        throw error
      }
      // emitResult is deliberately synchronous and ignores observer return
      // values. Do not probe thenables or drain unrelated reporter callbacks.
      receipt.resolve(event)
    },
    close,
  }
}
