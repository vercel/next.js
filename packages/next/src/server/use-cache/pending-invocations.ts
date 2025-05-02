import type { CacheEntry } from '../lib/cache-handlers/types'

export interface EntryAndResult {
  readonly pendingEntry: Promise<CacheEntry>
  readonly result: Promise<unknown>
}

interface CurrentPendingInvocation {
  readonly status: 'current'
  readonly promise: Promise<EntryAndResult>
}

interface NewPendingInvocation {
  readonly status: 'new'
  readonly resolve: (value: EntryAndResult) => void
  readonly reject: (reason: unknown) => void
}

export type PendingInvocation = CurrentPendingInvocation | NewPendingInvocation

// TODO: Move this map to the work store when cookies are allowed to be read in
// "use cache". This is needed to avoid sharing a result with late-encountered
// cookies (i.e. not part of the cache key yet) with other concurrent requests.
const pendingInvocationPromises = new Map<string, Promise<EntryAndResult>>()

export function trackPendingInvocation(cacheKey: string): PendingInvocation {
  const promise = pendingInvocationPromises.get(cacheKey)

  if (promise) {
    return { status: 'current', promise }
  }

  let resolvePendingInvocation: ((value: EntryAndResult) => void) | undefined
  let rejectPendingInvocation: ((reason: unknown) => void) | undefined

  pendingInvocationPromises.set(
    cacheKey,
    new Promise<EntryAndResult>((resolve, reject) => {
      resolvePendingInvocation = (entryAndResult: EntryAndResult) => {
        pendingInvocationPromises.delete(cacheKey)
        resolve(entryAndResult)
      }

      rejectPendingInvocation = (reason: unknown) => {
        pendingInvocationPromises.delete(cacheKey)
        reject(reason)
      }
    })
  )

  return {
    status: 'new',
    resolve: resolvePendingInvocation!,
    reject: rejectPendingInvocation!,
  }
}
