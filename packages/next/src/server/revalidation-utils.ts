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
  const prevRevalidateWrites = new Set(prev.pendingRevalidateWrites)
  return {
    pendingRevalidatedTags: diffRevalidatedTags(
      prev.pendingRevalidatedTags,
      curr.pendingRevalidatedTags
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

function diffRevalidatedTags(
  prev: RevalidationState['pendingRevalidatedTags'],
  curr: RevalidationState['pendingRevalidatedTags']
): RevalidationState['pendingRevalidatedTags'] {
  const prevTagsWithProfile = new Set(prev.map(getRevalidatedTagKey))

  return curr.filter((item) => {
    return !prevTagsWithProfile.has(getRevalidatedTagKey(item))
  })
}

function getRevalidatedTagKey(
  item: RevalidationState['pendingRevalidatedTags'][number]
): string {
  const profileKey =
    typeof item.profile === 'object'
      ? JSON.stringify(item.profile)
      : item.profile || ''

  return `${item.tag}:${profileKey}`
}

function mergeRevalidatedTags(
  prev: RevalidationState['pendingRevalidatedTags'],
  curr: RevalidationState['pendingRevalidatedTags']
): RevalidationState['pendingRevalidatedTags'] {
  const pendingRevalidatedTags = [...prev]
  const seenTagsWithProfile = new Set(
    pendingRevalidatedTags.map(getRevalidatedTagKey)
  )

  for (const item of curr) {
    const key = getRevalidatedTagKey(item)
    if (!seenTagsWithProfile.has(key)) {
      seenTagsWithProfile.add(key)
      pendingRevalidatedTags.push(item)
    }
  }

  return pendingRevalidatedTags
}

const executedRevalidatedTagsSymbol = Symbol.for(
  '@next/executed-revalidated-tags'
)

type WorkStoreWithExecutedRevalidations = WorkStore & {
  [key: symbol]: RevalidationState['pendingRevalidatedTags'] | undefined
}

function getExecutedRevalidatedTags(
  workStore: WorkStore
): RevalidationState['pendingRevalidatedTags'] | undefined {
  const store = workStore as WorkStoreWithExecutedRevalidations
  return store[executedRevalidatedTagsSymbol]
}

function setExecutedRevalidatedTags(
  workStore: WorkStore,
  pendingRevalidatedTags: RevalidationState['pendingRevalidatedTags']
) {
  const store = workStore as WorkStoreWithExecutedRevalidations
  store[executedRevalidatedTagsSymbol] = pendingRevalidatedTags
}

async function revalidateTags(
  tagsWithProfile: Array<{
    tag: string
    profile?: string | { expire?: number }
  }>,
  incrementalCache: IncrementalCache | undefined,
  workStore?: WorkStore
): Promise<void> {
  if (tagsWithProfile.length === 0) {
    return
  }

  const handlers = getCacheHandlers()
  const promises: Promise<void>[] = []

  // Group tags by profile for batch processing
  const tagsByProfile = new Map<
    | string
    | { stale?: number; revalidate?: number; expire?: number }
    | undefined,
    string[]
  >()

  for (const item of tagsWithProfile) {
    const profile = item.profile
    // Find existing profile by comparing values
    let existingKey = undefined
    for (const [key] of tagsByProfile) {
      if (
        typeof key === 'string' &&
        typeof profile === 'string' &&
        key === profile
      ) {
        existingKey = key
        break
      }
      if (
        typeof key === 'object' &&
        typeof profile === 'object' &&
        JSON.stringify(key) === JSON.stringify(profile)
      ) {
        existingKey = key
        break
      }
      if (key === profile) {
        existingKey = key
        break
      }
    }

    const profileKey = existingKey || profile
    if (!tagsByProfile.has(profileKey)) {
      tagsByProfile.set(profileKey, [])
    }
    tagsByProfile.get(profileKey)!.push(item.tag)
  }

  // Process each profile group
  for (const [profile, tagsForProfile] of tagsByProfile) {
    // Look up the cache profile from workStore if available
    let durations: { expire?: number } | undefined

    if (profile) {
      let cacheLife:
        | { stale?: number; revalidate?: number; expire?: number }
        | undefined

      if (typeof profile === 'object') {
        // Profile is already a cacheLife configuration object
        cacheLife = profile
      } else if (typeof profile === 'string') {
        // Profile is a string key, look it up in workStore
        cacheLife = workStore?.cacheLifeProfiles?.[profile]

        if (!cacheLife) {
          throw new Error(
            `Invalid profile provided "${profile}" must be configured under cacheLife in next.config or be "max"`
          )
        }
      }

      if (cacheLife) {
        durations = {
          expire: cacheLife.expire,
        }
      }
    }
    // If profile is not found and not 'max', durations will be undefined
    // which will trigger immediate expiration in the cache handler

    for (const handler of handlers || []) {
      if (profile) {
        promises.push(handler.updateTags?.(tagsForProfile, durations))
      } else {
        promises.push(handler.updateTags?.(tagsForProfile))
      }
    }

    if (incrementalCache) {
      promises.push(incrementalCache.revalidateTag(tagsForProfile, durations))
    }
  }

  await Promise.all(promises)
}

export function executeRevalidates(
  workStore: WorkStore,
  state?: RevalidationState
): false | Promise<void> {
  const promises: Promise<unknown>[] = []
  const revalidationState = state ?? cloneRevalidationState(workStore)
  const executedRevalidatedTags = getExecutedRevalidatedTags(workStore)

  const pendingRevalidatedTags = executedRevalidatedTags
    ? diffRevalidatedTags(
        executedRevalidatedTags,
        revalidationState.pendingRevalidatedTags
      )
    : revalidationState.pendingRevalidatedTags

  if (pendingRevalidatedTags.length > 0) {
    promises.push(
      revalidateTags(
        pendingRevalidatedTags,
        workStore.incrementalCache,
        workStore
      ).then(() => {
        setExecutedRevalidatedTags(
          workStore,
          executedRevalidatedTags
            ? mergeRevalidatedTags(
                executedRevalidatedTags,
                pendingRevalidatedTags
              )
            : pendingRevalidatedTags
        )
      })
    )
  }

  const pendingRevalidates = Object.values(revalidationState.pendingRevalidates)

  promises.push(...pendingRevalidates)

  const pendingRevalidateWrites = revalidationState.pendingRevalidateWrites

  promises.push(...pendingRevalidateWrites)

  if (promises.length === 0) {
    return false
  }

  return Promise.all(promises).then(() => undefined)
}
