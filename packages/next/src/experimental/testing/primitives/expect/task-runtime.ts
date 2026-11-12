import type { TestError } from '../utils'

/** The assertion queues and result fields owned by an existing test scope. */
export interface AssertionTask {
  type?: string
  fullTestName?: string
  promises?: Promise<unknown>[]
  onFinished?: (() => unknown)[]
  result?: {
    state: string
    errors?: TestError[]
  }
}

export interface AssertionPromiseObserver {
  recorded(promise: Promise<unknown>): void
  settled(promise: Promise<unknown>): void
  finished?(promise: Promise<unknown>, check: () => void): void
  capture?(): AssertionPromiseObserver | undefined
}

interface AssertionTaskEntry {
  runtimeTask: AssertionTask
  promiseObserver?: AssertionPromiseObserver
}

// Original async wrappers inherit only the genuine Chai constructor token.
const asyncAssertionIdentities = new WeakMap<object, object>()
const getAsyncAssertionIdentity = WeakMap.prototype.get.bind(
  asyncAssertionIdentities
)
const setAsyncAssertionIdentity = WeakMap.prototype.set.bind(
  asyncAssertionIdentities
)

export function getVitestAssertionIdentity(value: unknown): object | undefined {
  return getAsyncAssertionIdentity(value as object)
}

export function recordAsyncAssertionIdentity(
  value: object,
  identity: object
): void {
  setAsyncAssertionIdentity(value, identity)
}

// Publish the actual Test flag while an existing real scope owns the queues.
const assertionTaskRuntimes = new WeakMap<object, AssertionTaskEntry>()

export function registerVitestAssertionTaskRuntime(
  test: object,
  runtimeTask: object,
  promiseObserver?: AssertionPromiseObserver
): void {
  assertionTaskRuntimes.set(test, { runtimeTask, promiseObserver })
}

export function getAssertionTaskEntry(
  value: object
): AssertionTaskEntry | undefined {
  return assertionTaskRuntimes.get(value)
}

export function getVitestAssertionTaskRuntime(value: unknown): unknown {
  return assertionTaskRuntimes.get(value as object)?.runtimeTask || value
}
