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
    | 'pendingRevalidatedTags'
    | 'pendingRevalidates'
    | 'pendingRevalidateWrites'
    | 'pendingRevalidatedTagsWithProfile'
  >
>

function cloneRevalidationState(store: WorkStore): RevalidationState {
  return {
    pendingRevalidatedTags: store.pendingRevalidatedTags
      ? [...store.pendingRevalidatedTags]
      : [],
    pendingRevalidatedTagsWithProfile: store.pendingRevalidatedTagsWithProfile
      ? [...store.pendingRevalidatedTagsWithProfile]
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
  const prevTagsWithProfile = new Set(
    prev.pendingRevalidatedTagsWithProfile.map(
      (item) => `${item.tag}:${item.profile || ''}`
    )
  )
  const prevRevalidateWrites = new Set(prev.pendingRevalidateWrites)
  return {
    pendingRevalidatedTags: curr.pendingRevalidatedTags.filter(
      (tag) => !prevTags.has(tag)
    ),
    pendingRevalidatedTagsWithProfile:
      curr.pendingRevalidatedTagsWithProfile.filter(
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
  tags: string[],
  incrementalCache: IncrementalCache | undefined,
  tagsWithProfile?: Array<{ tag: string; profile?: string }>,
  workStore?: WorkStore
): Promise<void> {
  if (tags.length === 0 && (!tagsWithProfile || tagsWithProfile.length === 0)) {
    return
  }

  const handlers = getCacheHandlers()
  const promises: Promise<void>[] = []

  if (tagsWithProfile && tagsWithProfile.length > 0) {
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
      let durations: { stale?: number; expire?: number } | undefined

      if (profile && workStore?.cacheLifeProfiles?.[profile]) {
        const cacheLife = workStore.cacheLifeProfiles[profile]
        durations = {
          stale: cacheLife.stale,
          expire: cacheLife.expire,
        }
      } else if (profile === 'max') {
        // Default 'max' profile: stale immediately, expire in 1 year
        const oneYearInSeconds = 365 * 24 * 60 * 60
        durations = {
          stale: 0,
          expire: oneYearInSeconds,
        }
      }
      // If profile is not found and not 'max', durations will be undefined
      // which will trigger immediate expiration in the cache handler

      for (const handler of handlers || []) {
        promises.push(handler.expireTags(tagsForProfile, durations))
      }

      if (incrementalCache) {
        promises.push(incrementalCache.revalidateTag(tagsForProfile, durations))
      }
    }
  }

  if (incrementalCache && tags.length > 0) {
    // Fallback to old behavior for compatibility
    promises.push(incrementalCache.revalidateTag(tags))
  }

  if (handlers) {
    for (const handler of handlers) {
      promises.push(handler.expireTags(tags))
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

  const pendingRevalidatedTagsWithProfile =
    state?.pendingRevalidatedTagsWithProfile ??
    workStore.pendingRevalidatedTagsWithProfile ??
    []

  const pendingRevalidates =
    state?.pendingRevalidates ?? workStore.pendingRevalidates ?? {}

  const pendingRevalidateWrites =
    state?.pendingRevalidateWrites ?? workStore.pendingRevalidateWrites ?? []

  return Promise.all([
    revalidateTags(
      pendingRevalidatedTags,
      workStore.incrementalCache,
      pendingRevalidatedTagsWithProfile,
      workStore
    ),
    ...Object.values(pendingRevalidates),
    ...pendingRevalidateWrites,
  ])
}
