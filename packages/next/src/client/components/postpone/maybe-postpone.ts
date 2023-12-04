import type { StaticGenerationStore } from '../static-generation-async-storage.external'

import { postpone } from './postpone'
import { supportsPostpone } from './supports-postpone'

/**
 * If the current render supports postponing rendering, it will throw a postpone
 * error.
 *
 * @param staticGenerationStore The static generation store
 * @param reason The reason for postponing
 */
export function maybePostpone(
  staticGenerationStore: StaticGenerationStore,
  reason: string
) {
  if (!supportsPostpone(staticGenerationStore)) return

  postpone(staticGenerationStore, reason)
}
