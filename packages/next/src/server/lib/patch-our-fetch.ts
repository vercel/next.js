import * as serverHooks from '../../client/components/hooks-server-context'
import { staticGenerationAsyncStorage } from '../../client/components/static-generation-async-storage'

import { patchFetch } from './patch-fetch'

/**
 * This like the `patchFetch` function will patch the global `fetch` function
 * using the passed in hooks and storage. This one uses the module references
 * to patch it.
 *
 * This should only be called from the edge runtime.
 */
export function patchOurFetch() {
  patchFetch({ serverHooks, staticGenerationAsyncStorage })
}
