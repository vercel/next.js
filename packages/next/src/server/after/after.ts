import { getExpectedRequestStore } from '../../client/components/request-async-storage.external'
import { staticGenerationAsyncStorage } from '../../client/components/static-generation-async-storage.external'

import { markCurrentScopeAsDynamic } from '../app-render/dynamic-rendering'
import type { AfterTask } from './shared'

/**
 * This function allows you to schedule callbacks to be executed after the current request finishes.
 */
export function unstable_after<T>(task: AfterTask<T>) {
  const callingExpression = 'unstable_after'

  const requestStore = getExpectedRequestStore(callingExpression)

  const { afterContext } = requestStore
  if (!afterContext) {
    throw new Error('Invariant: No afterContext in requestStore')
  }
  if (!afterContext.enabled) {
    throw new Error(
      'unstable_after() must be explicitly enabled by setting `experimental.after: true` in your next.config.js.'
    )
  }

  const staticGenerationStore = staticGenerationAsyncStorage.getStore()

  if (staticGenerationStore) {
    if (staticGenerationStore.forceStatic) {
      // When we are forcing static, after() is a no-op
      return
    } else {
      markCurrentScopeAsDynamic(staticGenerationStore, callingExpression)
    }
  }

  return afterContext.after(task)
}
