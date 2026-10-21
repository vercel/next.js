import { AsyncLocalStorage } from 'node:async_hooks'
import type {
  AttemptContext,
  SuiteHookContext,
  RunnerFailure,
} from './lifecycle'

type Owner =
  | { kind: 'attempt'; context: AttemptContext }
  | { kind: 'hook'; context: SuiteHookContext }
  | {
      kind: 'collection' | 'file-fixtures' | 'worker-fixtures'
      context: { id: string; name: string }
    }

type Scope = Owner & {
  closed: boolean
  phase?: RunnerFailure['phase']
  authoredCallback?: boolean
  ancestors: readonly Scope[]
  onLateFailure(error: Error): void
  onUnhandledFailure?: (reason: unknown, promise?: Promise<unknown>) => void
}

// This module is only consumed by the supported Node testing runtime.
const storage = new AsyncLocalStorage<Scope>()

export function createAsyncScope(
  owner: Owner,
  onLateFailure: (error: Error) => void,
  onUnhandledFailure?: (reason: unknown, promise?: Promise<unknown>) => void
) {
  const parent = storage.getStore()
  const scope: Scope = {
    ...owner,
    closed: false,
    ancestors: parent ? [parent, ...parent.ancestors] : [],
    onLateFailure,
    onUnhandledFailure: onUnhandledFailure ?? parent?.onUnhandledFailure,
  }
  return {
    run<T>(fn: () => T): T {
      return storage.run(scope, fn)
    },
    close() {
      scope.closed = true
    },
  }
}

function current() {
  const scope = storage.getStore()
  if (scope?.closed) {
    const error = new Error(
      `Late Next testing API access from closed ${scope.kind} scope "${scope.context.name}" (${scope.context.id}).`
    )
    scope.onLateFailure(error)
    throw error
  }
  return scope
}

/** A phase view shares the original owner's closure fence and async ancestry. */
export function runWithCasePhase<T>(
  phase: RunnerFailure['phase'],
  fn: () => T,
  authoredCallback = false
): T {
  const owner = current()
  if (owner?.kind !== 'attempt') return fn()
  const view: Scope = {
    ...owner,
    get closed() {
      return owner.closed
    },
    phase,
    authoredCallback,
  }
  return storage.run(view, fn)
}

export function getOriginatingCasePhase() {
  const scope = current()
  return scope?.kind === 'attempt'
    ? {
        attemptId: scope.context.id,
        phase: scope.phase,
        ...(scope.authoredCallback ? { authoredCallback: true } : {}),
      }
    : undefined
}

export function assertScopeActive() {
  current()
}

/** Console attribution observes the actual origin without reopening an API scope. */
export function getConsoleTask() {
  const scope = storage.getStore()
  if (scope?.kind === 'attempt') {
    const context = scope.context
    return {
      taskId: context.testId,
      caseId: context.testId,
      attempt: { id: context.id, retry: context.retry, repeat: context.repeat },
    }
  }
  if (scope?.kind === 'hook') return { taskId: scope.context.suiteId }
  if (scope?.kind === 'collection') return { taskId: scope.context.id }
  return undefined
}

export function getOriginatingAttempt(): AttemptContext | undefined {
  const scope = current()
  return scope?.kind === 'attempt' ? scope.context : undefined
}

export function getOriginatingHook(): SuiteHookContext | undefined {
  const scope = current()
  return scope?.kind === 'hook' ? scope.context : undefined
}

export function getOriginatingCollection():
  | { id: string; name: string }
  | undefined {
  const scope = current()
  return scope?.kind === 'collection' ? scope.context : undefined
}

/** File fixtures retain their own owner through setup and deferred teardown. */
export function getOriginatingFileFixtures():
  | { id: string; name: string }
  | undefined {
  const scope = current()
  return scope?.kind === 'file-fixtures' ? scope.context : undefined
}

/** Actual asynchronous parents, rather than names or declaration-path guesses. */
export function getOriginatingScopeAncestors(): readonly string[] {
  return current()?.ancestors.map((scope) => scope.context.id) ?? []
}

/** Raw origin lookup for process rejection routing; closed owners still own failures. */
export function getOriginatingUnhandledFailureSink() {
  return storage.getStore()?.onUnhandledFailure
}

/** Bind future compiler work to the exact scope that started it. */
export function captureAsyncScope() {
  const scope = storage.getStore()
  current()
  return {
    run<T>(fn: () => T): T {
      const invoke = () => {
        current()
        return fn()
      }
      return scope ? storage.run(scope, invoke) : storage.exit(invoke)
    },
  }
}
