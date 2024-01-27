import { staticGenerationAsyncStorage } from '../../../client/components/static-generation-async-storage.external'
import { markCurrentScopeAsDynamic } from '../../app-render/dynamic-rendering'

/**
 * Expects to be called in an App Router render and will error if not.
 *
 * marks the current scope as dynamic. In non PPR cases this will make a static render
 * halt and mark the page as dynamic. In PPR cases this will postpone the render at this location.
 *
 * If we are inside a cache scope then this function is a noop
 */
export function unstable_noStore() {
  const callingExpression = 'unstable_noStore()'
  const store = staticGenerationAsyncStorage.getStore()
  if (!store) {
    // This generally implies we are being called in Pages router. We should probably not support
    // unstable_noStore in contexts outside of `react-server` condition but since we historically
    // have not errored here previously, we maintain that behavior for now.
    return
  } else if (store.forceStatic) {
    return
  } else {
    store.isUnstableNoStore = true
    markCurrentScopeAsDynamic(store, callingExpression)
  }
}
