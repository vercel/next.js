import { InvariantError } from '../../shared/lib/invariant-error'
import {
  postponeWithTracking,
  throwToInterruptStaticGeneration,
} from '../app-render/dynamic-rendering'
import {
  workAsyncStorage,
  type WorkStore,
} from '../app-render/work-async-storage.external'
import {
  workUnitAsyncStorage,
  type PrerenderStoreLegacy,
  type PrerenderStoreModernServer,
  type PrerenderStorePPR,
} from '../app-render/work-unit-async-storage.external'
import {
  getRuntimeLinkDataStage,
  getStaticLinkDataStage,
  makeHangingPromise,
} from '../dynamic-rendering-utils'
import type { ParamValue } from './params'
import { describeStringPropertyAccess } from '../../shared/lib/utils/reflect-utils'
import { actionAsyncStorage } from '../app-render/action-async-storage.external'
import { accumulateRootVaryParam } from '../app-render/vary-params'
import type {
  RenderStage,
  StagedRenderingController,
} from '../app-render/staged-rendering'

/**
 * Used for the compiler-generated `next/root-params` module.
 * @internal
 */
export function getRootParam(paramName: string): Promise<ParamValue> {
  const apiName = `\`import('next/root-params').${paramName}()\``

  const workStore = workAsyncStorage.getStore()
  if (!workStore) {
    throw new InvariantError(`Missing workStore in ${apiName}`)
  }

  const workUnitStore = workUnitAsyncStorage.getStore()
  if (!workUnitStore) {
    throw new Error(
      `Route ${workStore.route} used ${apiName} outside of a Server Component. This is not allowed.`
    )
  }

  const actionStore = actionAsyncStorage.getStore()
  if (actionStore) {
    if (actionStore.isAppRoute) {
      // TODO(root-params): add support for route handlers
      throw new Error(
        `Route ${workStore.route} used ${apiName} inside a Route Handler. Support for this API in Route Handlers is planned for a future version of Next.js.`
      )
    }
    if (actionStore.isAction && workUnitStore.phase === 'action') {
      // Actions are not fundamentally tied to a route (even if they're always submitted from some page),
      // so root params would be inconsistent if an action is called from multiple roots.
      // Make sure we check if the phase is "action" - we should not error in the rerender
      // after an action revalidates or updates cookies (which will still have `actionStore.isAction === true`)
      throw new Error(
        `${apiName} was used inside a Server Action. This is not supported. Functions from 'next/root-params' can only be called in the context of a route.`
      )
    }
  }

  switch (workUnitStore.type) {
    case 'unstable-cache': {
      throw new Error(
        `Route ${workStore.route} used ${apiName} inside \`unstable_cache\`. This is not supported. Use \`"use cache"\` instead.`
      )
    }
    case 'cache': {
      // NOTE: In shell prerenders, we delay caches that used root params
      // in use-cache-wrapper, during the final prerender, so we don't
      // need to do anything here
      if (!workUnitStore.rootParams) {
        throw new Error(
          `Route ${workStore.route} used ${apiName} inside \`"use cache"\` nested within \`unstable_cache\`. Root params are not available in this context.`
        )
      }
      workUnitStore.readRootParamNames.add(paramName)
      return Promise.resolve(workUnitStore.rootParams[paramName])
    }
    case 'prerender': {
      const { stagedRendering, fallbackRouteParams } = workUnitStore
      if (stagedRendering && process.env.__NEXT_APP_SHELLS) {
        // If the root param is a fallback param, we don't have a value to return
        if (fallbackRouteParams && fallbackRouteParams.has(paramName)) {
          return makeHangingPromise<ParamValue>(
            workUnitStore.renderSignal,
            workStore.route,
            apiName
          )
        }
        // Otherwise, it's link data, so we delay it to exclude it from the shell
        // and only resolve in the param-ful static stage
        return createRootParamPromiseForShellRender(
          stagedRendering,
          getStaticLinkDataStage(stagedRendering),
          apiName,
          paramName,
          workUnitStore.rootParams[paramName]
        )
      }

      return createPrerenderRootParamPromise(
        paramName,
        workStore,
        workUnitStore,
        apiName
      )
    }
    case 'prerender-ppr':
    case 'prerender-legacy': {
      return createPrerenderRootParamPromise(
        paramName,
        workStore,
        workUnitStore,
        apiName
      )
    }
    case 'validation-client':
    case 'prerender-client': {
      throw new InvariantError(
        `${apiName} must not be used within a client component. Next.js should be preventing ${apiName} from being included in client components statically, but did not in this case.`
      )
    }
    case 'request': {
      if (
        process.env.__NEXT_CACHE_COMPONENTS &&
        workUnitStore.validationSamples
      ) {
        const { assertRootParamInSamples } =
          require('../app-render/instant-validation/instant-samples') as typeof import('../app-render/instant-validation/instant-samples')
        // If we error, make sure we return a rejected promise instead of erroring synchronously.
        try {
          assertRootParamInSamples(
            workStore,
            workUnitStore.validationSamples.params,
            paramName
          )
        } catch (err) {
          return Promise.reject(err)
        }
        break
      }

      const { stagedRendering } = workUnitStore
      if (stagedRendering && process.env.__NEXT_APP_SHELLS) {
        return createRootParamPromiseForShellRender(
          stagedRendering,
          // Assuming we're rendering for cached navs, we only need
          // to recover a static shell and a static stage, so we can
          // resolve root params here. it means we can't get a session shell,
          // but that's okay because we get that from a separate render anyway.
          getStaticLinkDataStage(stagedRendering),
          apiName,
          paramName,
          workUnitStore.rootParams[paramName]
        )
      }
      break
    }
    case 'private-cache': {
      // NOTE: In shell prerenders, we delay caches that used root params
      // in use-cache-wrapper, during the final prerender, so we don't
      // need to do anything here.
      // In dev, private caches are persisted and keyed by root params (like
      // public caches), so we track which ones were read.
      if (workUnitStore.readRootParamNames) {
        workUnitStore.readRootParamNames.add(paramName)
      }
      break
    }
    case 'prerender-runtime': {
      const { stagedRendering } = workUnitStore
      if (stagedRendering && process.env.__NEXT_APP_SHELLS) {
        return createRootParamPromiseForShellRender(
          stagedRendering,
          // A runtime prerender with shells means that we want to recover a session shell.
          // Root params are link data, so we have to omit them from the shell.
          // Tihs means we must delay them until the runtime stage even though
          // semantically they're considered static.
          getRuntimeLinkDataStage(stagedRendering),
          apiName,
          paramName,
          workUnitStore.rootParams[paramName]
        )
      }

      break
    }
    case 'generate-static-params': {
      if (!(paramName in workUnitStore.rootParams)) {
        throw new Error(
          `Route ${workStore.route} used ${apiName} inside \`generateStaticParams\`, but the \`${paramName}\` parameter was not provided by a parent \`generateStaticParams\`. In \`generateStaticParams\`, root params are only available for segments nested below the segment that provides them.`
        )
      }
      break
    }
    default: {
      workUnitStore satisfies never
    }
  }

  accumulateRootVaryParam(paramName)
  return Promise.resolve(workUnitStore.rootParams[paramName])
}

type LinkDataStage =
  | RenderStage.EarlyStatic
  | RenderStage.Static
  | RenderStage.EarlyRuntime
  | RenderStage.Runtime

function createRootParamPromiseForShellRender(
  stagedRendering: StagedRenderingController,
  stage: LinkDataStage,
  apiName: string,
  paramName: string,
  paramValue: ParamValue
): Promise<ParamValue> {
  accumulateRootVaryParam(paramName)
  return stagedRendering.delayUntilStage(stage, apiName, paramValue)
}

function createPrerenderRootParamPromise(
  paramName: string,
  workStore: WorkStore,
  prerenderStore:
    | PrerenderStorePPR
    | PrerenderStoreLegacy
    | PrerenderStoreModernServer,
  apiName: string
): Promise<ParamValue> {
  switch (prerenderStore.type) {
    case 'prerender':
    case 'prerender-legacy':
    case 'prerender-ppr':
    default:
  }

  const underlyingParams = prerenderStore.rootParams

  switch (prerenderStore.type) {
    case 'prerender': {
      // We are in a cacheComponents prerender.
      // The param is a fallback, so it should be treated as dynamic.
      if (
        prerenderStore.fallbackRouteParams &&
        prerenderStore.fallbackRouteParams.has(paramName)
      ) {
        return makeHangingPromise<ParamValue>(
          prerenderStore.renderSignal,
          workStore.route,
          apiName
        )
      }
      break
    }
    case 'prerender-ppr': {
      // We aren't in a cacheComponents prerender, but the param is a fallback,
      // so we need to make an erroring params object which will postpone/error if you access it
      if (
        prerenderStore.fallbackRouteParams &&
        prerenderStore.fallbackRouteParams.has(paramName)
      ) {
        return makeErroringRootParamPromise(
          paramName,
          workStore,
          prerenderStore,
          apiName
        )
      }
      break
    }
    case 'prerender-legacy': {
      // legacy prerenders can't have fallback params
      break
    }
    default: {
      prerenderStore satisfies never
    }
  }

  // If the param is not a fallback param, we just return the statically available value.
  accumulateRootVaryParam(paramName)
  return Promise.resolve(underlyingParams[paramName])
}

/** Deliberately async -- we want to create a rejected promise, not error synchronously. */
async function makeErroringRootParamPromise(
  paramName: string,
  workStore: WorkStore,
  prerenderStore: PrerenderStorePPR | PrerenderStoreLegacy,
  apiName: string
): Promise<ParamValue> {
  const expression = describeStringPropertyAccess(apiName, paramName)
  // In most dynamic APIs, we also throw if `dynamic = "error"`.
  // However, root params are only dynamic when we're generating a fallback shell,
  // and even with `dynamic = "error"` we still support generating dynamic fallback shells.
  // TODO: remove this comment when cacheComponents is the default since there will be no `dynamic = "error"`
  switch (prerenderStore.type) {
    case 'prerender-ppr': {
      return postponeWithTracking(
        workStore.route,
        expression,
        prerenderStore.dynamicTracking
      )
    }
    case 'prerender-legacy': {
      return throwToInterruptStaticGeneration(
        expression,
        workStore,
        prerenderStore
      )
    }
    default: {
      prerenderStore satisfies never
    }
  }
}
