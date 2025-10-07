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
  const prevTagsWithProfile = new Set(
    prev.pendingRevalidatedTags.map(
      (item) => `${item.tag}:${item.profile || ''}`
    )
  )
  const prevRevalidateWrites = new Set(prev.pendingRevalidateWrites)
  return {
    pendingRevalidatedTags: curr.pendingRevalidatedTags.filter(
      (item) => !prevTagsWithProfile.has(`${item.tag}:${item.profile || ''}`)
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
  tagsWithProfile: Array<{ tag: string; profile?: string }>,
  incrementalCache: IncrementalCache | undefined,
  workStore?: WorkStore
): Promise<void> {
  if (tagsWithProfile.length === 0) {
    return
  }

  const handlers = getCacheHandlers()
  const promises: Promise<void>[] = []

  // Group tags by profile for batch processing
  const tagsByProfile = new Map<string | undefined, string[]>()

  for (const item of tagsWithProfile) {
    const profile = item.profile
    if (!tagsByProfile.has(profile)) {
      tagsByProfile.set(profile, [])
    }
    tagsByProfile.get(profile)!.push(item.tag)
  }

  // Process each profile group
  for (const [profile, tagsForProfile] of tagsByProfile) {
    // Look up the cache profile from workStore if available
    let durations: { expire?: number } | undefined

    if (profile) {
      const cacheLife = workStore?.cacheLifeProfiles?.[profile]

      if (!cacheLife) {
        throw new Error(
          `Invalid profile provided "${profile}" must be configured under cacheLife in next.config or be "max"`
        )
      }
      durations = {
        expire: cacheLife.expire,
      }
    }
    // If profile is not found and not 'max', durations will be undefined
    // which will trigger immediate expiration in the cache handler

    for (const handler of handlers || []) {
      if (profile) {
        promises.push(handler.updateTags(tagsForProfile, durations))
      } else {
        promises.push(handler.updateTags(tagsForProfile))
      }
    }

    if (incrementalCache) {
      promises.push(incrementalCache.revalidateTag(tagsForProfile, durations))
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
    revalidateTags(
      pendingRevalidatedTags,
      workStore.incrementalCache,
      workStore
    ),
    ...Object.values(pendingRevalidates),
    ...pendingRevalidateWrites,
  ])
}
