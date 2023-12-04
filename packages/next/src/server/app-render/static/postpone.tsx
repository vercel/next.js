import type { StaticGenerationStore } from '../../../client/components/static-generation-async-storage.external'

import { postpone } from '../../../client/components/postpone/postpone'

/**
 * This component will call `React.postpone` that throws the postponed error.
 */
export const Postpone = ({
  staticGenerationStore,
  reason,
}: {
  staticGenerationStore: StaticGenerationStore
  reason: string
}): never => {
  // Call the postpone API now.
  postpone(staticGenerationStore, reason)
}
