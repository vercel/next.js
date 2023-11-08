import type { StaticGenerationStore } from './static-generation-async-storage.external'

export function maybePostpone(
  staticGenerationStore: StaticGenerationStore,
  reason: string
) {
  // If we aren't performing a static generation or we aren't using PPR then
  // we don't need to postpone.
  if (
    !staticGenerationStore.isStaticGeneration ||
    !staticGenerationStore.experimental.ppr ||
    !staticGenerationStore.postpone
  ) {
    return
  }

  // Keep track of if the postpone API has been called.
  staticGenerationStore.postponeWasTriggered = true

  staticGenerationStore.postpone(reason)
}
