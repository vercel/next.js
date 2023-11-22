import type { StaticGenerationStore } from '../../client/components/static-generation-async-storage.external'

import { maybePostpone } from '../../client/components/maybe-postpone'

/**
 * This component will call `maybePostpone` and throw the postponed error if
 * the conditions are met. Otherwise, it will render the children.
 */
export const MaybePostpone = ({
  children,
  reason,
  staticGenerationStore,
}: {
  children: React.ReactNode
  reason: string
  staticGenerationStore: StaticGenerationStore
}) => {
  // If we meet the conditions to postpone, this function will throw the
  // postponed error to signal to React that this component should be
  // resumed.
  maybePostpone(staticGenerationStore, reason)

  return children
}
