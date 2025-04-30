import { StaticGenBailoutError } from '../../client/components/static-generation-bailout'
import {
  serverTimingAsyncStorage,
  type Metrics,
} from '../app-render/server-timing.external'
import { workAsyncStorage } from '../app-render/work-async-storage.external'

export function metrics(): Metrics {
  const workStore = workAsyncStorage.getStore()
  const serverTimingStore = serverTimingAsyncStorage.getStore()
  if (workStore) {
    if (serverTimingStore) {
      if (workStore.dynamicShouldError) {
        throw new StaticGenBailoutError(
          `Route ${workStore.route} with \`dynamic = "error"\` couldn't be rendered statically because it used \`metrics\`. See more info here: https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic#dynamic-rendering`
        )
      }
      return serverTimingStore.metrics
    }
    console.warn(serverTimingAsyncStorage)
    throw new Error(
      `Route ${workStore.route} used "metrics" outside server actions`
    )
  }
  return new Map([['perro', {}]])

  // throw new Error(
  //   `Missing serverTimingAsyncStorage.`
  // )
}
