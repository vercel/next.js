import { AsyncLocalStorage } from 'node:async_hooks'
import type { AttemptContext, SuiteHookContext } from './lifecycle'

type Owner =
  | { kind: 'attempt'; context: AttemptContext }
  | { kind: 'hook'; context: SuiteHookContext }
  | {
      kind: 'collection' | 'file-fixtures'
      context: { id: string; name: string }
    }

type Scope = Owner & {
  closed: boolean
  onLateFailure(error: Error): void
}

// This module is only consumed by the supported Node testing runtime.
const storage = new AsyncLocalStorage<Scope>()

export function createAsyncScope(
  owner: Owner,
  onLateFailure: (error: Error) => void
) {
  const scope: Scope = { ...owner, closed: false, onLateFailure }
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

export function assertScopeActive() {
  current()
}

export function getOriginatingAttempt(): AttemptContext | undefined {
  const scope = current()
  return scope?.kind === 'attempt' ? scope.context : undefined
}

export function getOriginatingHook(): SuiteHookContext | undefined {
  const scope = current()
  return scope?.kind === 'hook' ? scope.context : undefined
}
