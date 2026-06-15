import {
  createUseCacheTimeoutError,
  createUseCacheDeadlockError,
} from './use-cache-messages'

export class UseCacheTimeoutError extends Error {
  constructor() {
    super(createUseCacheTimeoutError().message)
  }
}

export class UseCacheDeadlockError extends Error {
  constructor() {
    super(createUseCacheDeadlockError().message)
  }
}

/**
 * Used purely as `cause` for the nested-dynamic cache error: its captured stack
 * points at the inner `"use cache"` invocation that propagated a dynamic cache
 * life up to the outer cache. Constructed eagerly in `cache()` while the caller
 * is still on the synchronous stack — see use-cache-wrapper.ts.
 */
export class NestedDynamicUseCacheError extends Error {
  constructor() {
    super(
      'This "use cache" has a dynamic cache life that was propagated to its parent.'
    )
    this.name = 'Nested dynamic "use cache"'
  }
}
