import type { AttemptContext, SuiteHookContext } from '../runner/lifecycle'

type Owner =
  | { kind: 'attempt'; context: AttemptContext }
  | { kind: 'hook'; context: SuiteHookContext }
  | {
      kind: 'collection' | 'file-fixtures' | 'worker-fixtures'
      context: { id: string; name: string }
    }
type Scope = Owner & {
  closed: boolean
  onLateFailure(error: Error): void
  onUnhandledFailure?: (reason: unknown) => void
}
let collection: Scope | undefined
let fileOwner: Scope | undefined
let invocation: Scope | undefined
const attempts = new Map<string, Scope>()

function closed(scope: Scope): never {
  const error = new Error(
    `Late Browser Mode API access from closed ${scope.kind} scope "${scope.context.name}" (${scope.context.id}).`
  )
  scope.onLateFailure(error)
  throw error
}
function current() {
  const scope = invocation ?? collection
  if (scope?.closed) closed(scope)
  return scope
}

/**
 * Internal lifecycle promises never install a mutable current attempt. The only
 * attempt scope is the lexical stack around one actual synchronous user body.
 * The page/file lifetime has exactly one immutable owner and one selected case.
 */
export function createAsyncScope(
  owner: Owner,
  onLateFailure: (error: Error) => void,
  onUnhandledFailure?: (reason: unknown) => void
) {
  const scope: Scope = {
    ...owner,
    closed: false,
    onLateFailure,
    onUnhandledFailure,
  }
  if (owner.kind === 'attempt') {
    if (attempts.size)
      throw new Error(
        'Browser Mode requires one selected case and one attempt per page.'
      )
    attempts.set(owner.context.id, scope)
  }
  return {
    run<T>(callback: () => T): T {
      if (scope.closed) closed(scope)
      if (scope.kind === 'collection') {
        if (fileOwner && fileOwner !== scope)
          throw new Error('Browser Mode cannot reuse a page for another file.')
        fileOwner = scope
        collection = scope
      }
      return callback()
    },
    close() {
      scope.closed = true
      if (collection === scope) collection = undefined
    },
  }
}

export function invokeSynchronousAttempt<T>(
  owner: AttemptContext,
  callback: () => T
): T {
  const scope = attempts.get(owner.id)
  if (!scope || scope.closed || invocation || collection)
    throw new Error('Invalid Browser Mode synchronous attempt ownership.')
  invocation = scope
  try {
    const result = callback()
    if (
      result &&
      typeof (result as unknown as PromiseLike<unknown>).then === 'function'
    ) {
      // Observe its eventual rejection, while refusing to publish successful
      // synchronous results or any snapshot updates from asynchronous bodies.
      Promise.resolve(result).catch((reason) =>
        scope.onUnhandledFailure?.(reason)
      )
      throw new Error(
        'Browser Mode currently requires a synchronous test body.'
      )
    }
    return result
  } finally {
    invocation = undefined
  }
}

/** Public facade checks this before dispatch, including retained matchers. */
export function assertBrowserApiScope(
  kind: 'declaration' | 'assertion' | 'utility'
) {
  const scope = current()
  if (scope && (scope.kind === 'attempt' || scope.kind === 'collection')) {
    if (kind === 'declaration' && scope.kind !== 'collection')
      throw new Error(
        'Browser Mode declarations require the active collection owner.'
      )
    return
  }
  const error = new Error(
    'Browser Mode API access requires its synchronous file collection or test invocation.'
  )
  fileOwner?.onLateFailure(error)
  throw error
}

export function assertScopeActive() {
  current()
}
export function getOriginatingAttempt() {
  const scope = current()
  return scope?.kind === 'attempt' ? scope.context : undefined
}
export function getOriginatingHook() {
  return undefined
}
export function getOriginatingCollection() {
  const scope = current()
  return scope?.kind === 'collection' ? scope.context : undefined
}
export function getOriginatingScopeAncestors(): readonly string[] {
  return []
}
export function getOriginatingUnhandledFailureSink() {
  return current()?.onUnhandledFailure ?? fileOwner?.onUnhandledFailure
}

/** Fixed-page infrastructure authority never changes public lexical access. */
export function assertInternalAttemptOwner(id: string): void {
  const scope = attempts.get(id)
  if (!scope || scope.closed || attempts.size !== 1)
    throw new Error('Browser Mode internal assertion owner is not live.')
}
