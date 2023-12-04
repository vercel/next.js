import type { StaticGenerationStore } from '../../../client/components/static-generation-async-storage.external'

import { postpone } from '../../../client/components/postpone/postpone'
import { supportsPostpone } from '../../../client/components/postpone/supports-postpone'

/**
 * This component will call `React.postpone` that throws the postponed error.
 */
export const ForceDynamic = ({
  staticGenerationStore,
}: {
  staticGenerationStore: StaticGenerationStore
}): never => {
  // Call the postpone API now with the reason set to "force-dynamic".
  postpone(staticGenerationStore, 'dynamic = "force-dynamic" was used')
}

export function supportsForceDynamic(
  staticGenerationStore: StaticGenerationStore
): boolean {
  return supportsPostpone(staticGenerationStore)
}
