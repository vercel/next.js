import { requestAsyncStorage } from '../../client/components/request-async-storage.external'
import { workAsyncStorage } from '../../client/components/work-async-storage.external'
import { cacheAsyncStorage } from '../../server/app-render/cache-async-storage.external'
import { StaticGenBailoutError } from '../../client/components/static-generation-bailout'

import { markCurrentScopeAsDynamic } from '../app-render/dynamic-rendering'

export type AfterTask<T = unknown> = Promise<T> | AfterCallback<T>
export type AfterCallback<T = unknown> = () => T | Promise<T>

/**
 * This function allows you to schedule callbacks to be executed after the current request finishes.
 */
export function unstable_after<T>(task: AfterTask<T>) {
  const callingExpression = 'unstable_after'

  // TODO: This is not safe. afterContext should move to WorkStore.
  const requestStore = requestAsyncStorage.getStore()
  if (!requestStore) {
    throw new Error(
      `\`${callingExpression}\` was called outside a request scope. Read more: https://nextjs.org/docs/messages/next-dynamic-api-wrong-context`
    )
  }

  const { afterContext } = requestStore
  if (!afterContext) {
    throw new Error(
      '`unstable_after()` must be explicitly enabled by setting `experimental.after: true` in your next.config.js.'
    )
  }

  const workStore = workAsyncStorage.getStore()
  const cacheStore = cacheAsyncStorage.getStore()

  if (workStore) {
    if (workStore.forceStatic) {
      throw new StaticGenBailoutError(
        `Route ${workStore.route} with \`dynamic = "force-static"\` couldn't be rendered statically because it used \`${callingExpression}\`. See more info here: https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic#dynamic-rendering`
      )
    } else {
      markCurrentScopeAsDynamic(workStore, cacheStore, callingExpression)
    }
  }

  return afterContext.after(task)
}
