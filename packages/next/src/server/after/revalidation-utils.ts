import type { WorkStore } from '../app-render/work-async-storage.external'

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
    'revalidatedTags' | 'pendingRevalidates' | 'pendingRevalidateWrites'
  >
>

function cloneRevalidationState(store: WorkStore): RevalidationState {
  return {
    revalidatedTags: store.revalidatedTags ? [...store.revalidatedTags] : [],
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
  const prevTags = new Set(prev.revalidatedTags)
  const prevRevalidateWrites = new Set(prev.pendingRevalidateWrites)
  return {
    revalidatedTags: curr.revalidatedTags.filter((tag) => !prevTags.has(tag)),
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

async function executeRevalidates(
  workStore: WorkStore,
  {
    revalidatedTags,
    pendingRevalidates,
    pendingRevalidateWrites,
  }: RevalidationState
) {
  return Promise.all([
    workStore.incrementalCache?.revalidateTag(revalidatedTags),
    ...Object.values(pendingRevalidates),
    ...pendingRevalidateWrites,
  ])
}
