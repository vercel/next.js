import { workAsyncStorage } from '../app-render/work-async-storage.external'
import { workUnitAsyncStorage } from '../app-render/work-unit-async-storage.external'
import { StaticGenBailoutError } from '../../client/components/static-generation-bailout'

import { markCurrentScopeAsDynamic } from '../app-render/dynamic-rendering'

export type AfterTask<T = unknown> = Promise<T> | AfterCallback<T>
export type AfterCallback<T = unknown> = () => T | Promise<T>

/**
 * This function allows you to schedule callbacks to be executed after the current request finishes.
 */
export function unstable_after<T>(task: AfterTask<T>): void {
  const workStore = workAsyncStorage.getStore()
  const workUnitStore = workUnitAsyncStorage.getStore()

  if (!workStore) {
    // TODO(after): the linked docs page talks about *dynamic* APIs, which unstable_after soon won't be anymore
    throw new Error(
      '`unstable_after` was called outside a request scope. Read more: https://nextjs.org/docs/messages/next-dynamic-api-wrong-context'
    )
  }

  const { afterContext } = workStore
  if (!afterContext) {
    throw new Error(
      '`unstable_after` must be explicitly enabled by setting `experimental.after: true` in your next.config.js.'
    )
  }

  // TODO: After should not cause dynamic.
  const callingExpression = 'unstable_after'
  if (workStore.forceStatic) {
    throw new StaticGenBailoutError(
      `Route ${workStore.route} with \`dynamic = "force-static"\` couldn't be rendered statically because it used \`${callingExpression}\`. See more info here: https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic#dynamic-rendering`
    )
  } else {
    markCurrentScopeAsDynamic(workStore, workUnitStore, callingExpression)
  }

  afterContext.after(task)
}
