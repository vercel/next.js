import type { StaticGenerationStore } from './static-generation-async-storage.external'

export function maybePostpone(
  staticGenerationStore: StaticGenerationStore,
  reason: string
) {
  // If we aren't performing a static generation or we aren't using PPR then
  // we don't need to postpone.
  if (
    !staticGenerationStore.isStaticGeneration ||
    !staticGenerationStore.experimental.ppr
  ) {
    return
  }

  // App Route's cannot be postponed, so we only postpone if it's a page. If the
  // postpone API is available, use it now.
  const React = require('react') as typeof import('react')
  if (typeof React.unstable_postpone !== 'function') return

  // Keep track of if the postpone API has been called.
  staticGenerationStore.postponeWasTriggered = true

  React.unstable_postpone(
    `This page needs to bail out of prerendering at this point because it used ${reason}. ` +
      `React throws this special object to indicate where. It should not be caught by ` +
      `your own try/catch. Learn more: https://nextjs.org/docs/messages/ppr-caught-error`
  )
}
