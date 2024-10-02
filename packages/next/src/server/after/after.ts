import { getExpectedRequestStore } from '../../client/components/request-async-storage.external'
import { staticGenerationAsyncStorage } from '../../client/components/work-async-storage.external'
import { StaticGenBailoutError } from '../../client/components/static-generation-bailout'

import { markCurrentScopeAsDynamic } from '../app-render/dynamic-rendering'

export type AfterTask<T = unknown> = Promise<T> | AfterCallback<T>
export type AfterCallback<T = unknown> = () => T | Promise<T>

/**
 * This function allows you to schedule callbacks to be executed after the current request finishes.
 */
export function unstable_after<T>(task: AfterTask<T>) {
  const callingExpression = 'unstable_after'

  const requestStore = getExpectedRequestStore(callingExpression)

  const { afterContext } = requestStore
  if (!afterContext) {
    throw new Error(
      '`unstable_after()` must be explicitly enabled by setting `experimental.after: true` in your next.config.js.'
    )
  }

  const workStore = staticGenerationAsyncStorage.getStore()

  if (workStore) {
    if (workStore.forceStatic) {
      throw new StaticGenBailoutError(
        `Route ${workStore.route} with \`dynamic = "force-static"\` couldn't be rendered statically because it used \`${callingExpression}\`. See more info here: https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic#dynamic-rendering`
      )
    } else {
      markCurrentScopeAsDynamic(workStore, callingExpression)
    }
  }

  return afterContext.after(task)
}
