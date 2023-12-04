import type { StaticGenerationStore } from '../static-generation-async-storage.external'

/**
 * Throws a postpone error to postpone rendering. This should only be invoked
 * from within the Next.js framework itself during the React rendering phase.
 *
 * @param staticGenerationStore The static generation store
 * @param reason The reason for postponing
 */
export function postpone(
  staticGenerationStore: StaticGenerationStore,
  reason: string
): never {
  // Keep track of if the postpone API has been called.
  staticGenerationStore.postponeWasTriggered = true

  if (!staticGenerationStore.postpone) {
    throw new Error(
      'Invariant: PPR is enabled but the postpone API is unavailable'
    )
  }

  return staticGenerationStore.postpone(
    `This page needs to bail out of prerendering at this point because it used ${reason}. ` +
      `React throws this special object to indicate where. It should not be caught by ` +
      `your own try/catch. Learn more: https://nextjs.org/docs/messages/ppr-caught-error`
  ) satisfies never
}
