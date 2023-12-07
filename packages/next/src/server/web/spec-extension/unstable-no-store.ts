import { staticGenerationAsyncStorage } from '../../../client/components/static-generation-async-storage.external'
import { staticGenerationBailout } from '../../../client/components/static-generation-bailout'

export function unstable_noStore() {
  const staticGenerationStore = staticGenerationAsyncStorage.getStore()

  if (staticGenerationStore?.isUnstableCacheCallback) {
    // if called within a next/cache call, we want to cache the result
    // and defer to the next/cache call to handle how to cache the result.
    return
  }

  staticGenerationBailout('unstable_noStore', {
    link: 'https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic#dynamic-rendering',
  })
}
