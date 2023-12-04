import type { StaticGenerationStore } from '../static-generation-async-storage.external'

/**
 * Returns true if the current render supports postponing rendering.
 *
 * @param staticGenerationStore The static generation store
 * @returns True if the current render supports postponing rendering
 */
export function supportsPostpone(staticGenerationStore: StaticGenerationStore) {
  // If we aren't performing a static generation or we aren't using PPR then
  // we don't need to postpone.
  return (
    staticGenerationStore.isStaticGeneration &&
    staticGenerationStore.experimental.ppr
  )
}
