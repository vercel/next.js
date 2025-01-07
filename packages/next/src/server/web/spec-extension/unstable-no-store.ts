import { workAsyncStorage } from '../../app-render/work-async-storage.external'
import { workUnitAsyncStorage } from '../../app-render/work-unit-async-storage.external'
import { markCurrentScopeAsDynamic } from '../../app-render/dynamic-rendering'

/**
 * This function can be used to declaratively opt out of static rendering and indicate a particular component should not be cached.
 *
 * It marks the current scope as dynamic.
 *
 * - In [non-PPR](https://nextjs.org/docs/app/api-reference/next-config-js/partial-prerendering) cases this will make a static render
 * halt and mark the page as dynamic.
 * - In PPR cases this will postpone the render at this location.
 *
 * If we are inside a cache scope then this function does nothing.
 *
 * @note It expects to be called within App Router and will error otherwise.
 *
 * Read more: [Next.js Docs: `unstable_noStore`](https://nextjs.org/docs/app/api-reference/functions/unstable_noStore)
 */
export function unstable_noStore() {
  const callingExpression = 'unstable_noStore()'
  const store = workAsyncStorage.getStore()
  const workUnitStore = workUnitAsyncStorage.getStore()
  if (!store) {
    // This generally implies we are being called in Pages router. We should probably not support
    // unstable_noStore in contexts outside of `react-server` condition but since we historically
    // have not errored here previously, we maintain that behavior for now.
    return
  } else if (store.forceStatic) {
    return
  } else {
    store.isUnstableNoStore = true
    if (workUnitStore && workUnitStore.type === 'prerender') {
      // unstable_noStore() is a noop in Dynamic I/O.
    } else {
      markCurrentScopeAsDynamic(store, workUnitStore, callingExpression)
    }
  }
}
