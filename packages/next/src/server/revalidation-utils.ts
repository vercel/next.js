import type { WorkStore } from './app-render/work-async-storage.external'
import type { IncrementalCache } from './lib/incremental-cache'
import { getCacheHandlers } from './use-cache/handlers'

/** Run a callback, and execute any *new* revalidations added during its runtime. */
export async function withExecuteRevalidates<T>(
  store: WorkStore | undefined,
  callback: () => Promise<T>
): Promise<T> {
  if (!store) {
    return callback()
  }
  // If we executed any revalidates during the request, then we don't want to execute them again.
  // save the state so we can check if anything changed after we're done running callbacks.
  const savedRevalidationState = cloneRevalidationState(store)
  try {
    return await callback()
  } finally {
    // Check if we have any new revalidates, and if so, wait until they are all resolved.
    const newRevalidates = diffRevalidationState(
      savedRevalidationState,
      cloneRevalidationState(store)
    )
    await executeRevalidates(store, newRevalidates)
  }
}

type RevalidationState = Required<
  Pick<
    WorkStore,
    'pendingRevalidatedTags' | 'pendingRevalidates' | 'pendingRevalidateWrites'
  >
>

function cloneRevalidationState(store: WorkStore): RevalidationState {
  return {
    pendingRevalidatedTags: store.pendingRevalidatedTags
      ? [...store.pendingRevalidatedTags]
      : [],
    pendingRevalidates: { ...store.pendingRevalidates },
    pendingRevalidateWrites: store.pendingRevalidateWrites
      ? [...store.pendingRevalidateWrites]
      : [],
  }
}

function diffRevalidationState(
  prev: RevalidationState,
  curr: RevalidationState
): RevalidationState {
  const prevTags = new Set(prev.pendingRevalidatedTags)
  const prevRevalidateWrites = new Set(prev.pendingRevalidateWrites)
  return {
    pendingRevalidatedTags: curr.pendingRevalidatedTags.filter(
      (tag) => !prevTags.has(tag)
    ),
    pendingRevalidates: Object.fromEntries(
      Object.entries(curr.pendingRevalidates).filter(
        ([key]) => !(key in prev.pendingRevalidates)
      )
    ),
    pendingRevalidateWrites: curr.pendingRevalidateWrites.filter(
      (promise) => !prevRevalidateWrites.has(promise)
    ),
  }
}

async function revalidateTags(
  tags: string[],
  incrementalCache: IncrementalCache | undefined
): Promise<void> {
  if (tags.length === 0) {
    return
  }

  const promises: Promise<void>[] = []

  if (incrementalCache) {
    promises.push(incrementalCache.revalidateTag(tags))
  }

  const handlers = getCacheHandlers()
  if (handlers) {
    for (const handler of handlers) {
      promises.push(handler.expireTags(...tags))
    }
  }

  await Promise.all(promises)
}

export async function executeRevalidates(
  workStore: WorkStore,
  state?: RevalidationState
) {
  const pendingRevalidatedTags =
    state?.pendingRevalidatedTags ?? workStore.pendingRevalidatedTags ?? []

  const pendingRevalidates =
    state?.pendingRevalidates ?? workStore.pendingRevalidates ?? {}

  const pendingRevalidateWrites =
    state?.pendingRevalidateWrites ?? workStore.pendingRevalidateWrites ?? []

  return Promise.all([
    revalidateTags(pendingRevalidatedTags, workStore.incrementalCache),
    ...Object.values(pendingRevalidates),
    ...pendingRevalidateWrites,
  ])
}
