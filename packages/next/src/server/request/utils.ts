import { StaticGenBailoutError } from '../../client/components/static-generation-bailout'
import { actionAsyncStorage } from '../app-render/action-async-storage.external'
import { afterTaskAsyncStorage } from '../app-render/after-task-async-storage.external'
import type { WorkStore } from '../app-render/work-async-storage.external'
import { createSearchParamsInUseCacheError } from '../use-cache/use-cache-messages'
import type { WorkUnitStore } from '../app-render/work-unit-async-storage.external'

export function throwWithStaticGenerationBailoutErrorWithDynamicError(
  route: string,
  expression: string
): never {
  throw new StaticGenBailoutError(
    `Route ${route} with \`dynamic = "error"\` couldn't be rendered statically because it used ${expression}. See more info here: https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic#dynamic-rendering`
  )
}

export function throwForSearchParamsAccessInUseCache(
  workStore: WorkStore,
  constructorOpt: Function
): never {
  const error = createSearchParamsInUseCacheError(workStore.route)

  Error.captureStackTrace(error, constructorOpt)
  workStore.invalidDynamicUsageError ??= error

  throw error
}

export function isRequestApiAllowedInCurrentPhase(
  workUnitStore: WorkUnitStore
): boolean {
  switch (workUnitStore.phase) {
    case 'action':
    case 'render': {
      // The request is still in progress. The API may be disallowed for other reasons,
      // but not because of phase.
      return true
    }
    case 'after': {
      // The request has finished.

      // If we're in a Route Handler or a Server Action,
      // request APIs can be called everywhere, even in after().
      const actionStore = actionAsyncStorage.getStore()
      if (actionStore && (actionStore.isAppRoute || actionStore.isAction)) {
        return true
      }

      const afterTaskStore = afterTaskAsyncStorage.getStore()
      if (afterTaskStore) {
        // We're in an `after` callback. Request APIs are callable if
        // the `after()` call happened in an action phase:
        // - in a Route Handler
        // - in a Server Action's body (but not the render after)
        //
        // TODO(after): Is it even possible to have `phase === 'action'` but no `actionStore`?
        // We should revisit this setup and simplify this.
        return afterTaskStore.rootTaskSpawnPhase === 'action'
      }

      // Otherwise, we must be in a page, in the `after` phase.
      // We don't allow calling request APIs here because we'd miss
      // them during prerendering and wouldn't know that the page is dynamic.
      return false
    }
  }
}
