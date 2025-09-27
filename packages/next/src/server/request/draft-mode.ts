import {
  getDraftModeProviderForCacheScope,
  throwForMissingRequestStore,
} from '../app-render/work-unit-async-storage.external'

import type { DraftModeProvider } from '../async-storage/draft-mode-provider'

import {
  workAsyncStorage,
  type WorkStore,
} from '../app-render/work-async-storage.external'
import { workUnitAsyncStorage } from '../app-render/work-unit-async-storage.external'
import {
  abortAndThrowOnSynchronousRequestDataAccess,
  delayUntilRuntimeStage,
  postponeWithTracking,
  trackDynamicDataInDynamicRender,
} from '../app-render/dynamic-rendering'
import { createDedupedByCallsiteServerErrorLoggerDev } from '../create-deduped-by-callsite-server-error-logger'
import { StaticGenBailoutError } from '../../client/components/static-generation-bailout'
import { DynamicServerError } from '../../client/components/hooks-server-context'
import { InvariantError } from '../../shared/lib/invariant-error'
import { ReflectAdapter } from '../web/spec-extension/adapters/reflect'

export function draftMode(): Promise<DraftMode> {
  const callingExpression = 'draftMode'
  const workStore = workAsyncStorage.getStore()
  const workUnitStore = workUnitAsyncStorage.getStore()

  if (!workStore || !workUnitStore) {
    throwForMissingRequestStore(callingExpression)
  }

  switch (workUnitStore.type) {
    case 'prerender-runtime':
      // TODO(runtime-ppr): does it make sense to delay this? normally it's always microtasky
      return delayUntilRuntimeStage(
        workUnitStore,
        createOrGetCachedDraftMode(workUnitStore.draftMode, workStore)
      )
    case 'request':
      return createOrGetCachedDraftMode(workUnitStore.draftMode, workStore)

    case 'cache':
    case 'private-cache':
    case 'unstable-cache':
      // Inside of `"use cache"` or `unstable_cache`, draft mode is available if
      // the outmost work unit store is a request store (or a runtime prerender),
      // and if draft mode is enabled.
      const draftModeProvider = getDraftModeProviderForCacheScope(
        workStore,
        workUnitStore
      )

      if (draftModeProvider) {
        return createOrGetCachedDraftMode(draftModeProvider, workStore)
      }

    // Otherwise, we fall through to providing an empty draft mode.
    // eslint-disable-next-line no-fallthrough
    case 'prerender':
    case 'prerender-client':
    case 'prerender-ppr':
    case 'prerender-legacy':
      // Return empty draft mode
      return createOrGetCachedDraftMode(null, workStore)

    default:
      return workUnitStore satisfies never
  }
}

function createOrGetCachedDraftMode(
  draftModeProvider: DraftModeProvider | null,
  workStore: WorkStore | undefined
): Promise<DraftMode> {
  const cacheKey = draftModeProvider ?? NullDraftMode
  const cachedDraftMode = CachedDraftModes.get(cacheKey)

  if (cachedDraftMode) {
    return cachedDraftMode
  }

  if (process.env.NODE_ENV === 'development' && !workStore?.isPrefetchRequest) {
    const route = workStore?.route
    return createDraftModeWithDevWarnings(draftModeProvider, route)
  } else {
    return Promise.resolve(new DraftMode(draftModeProvider))
  }
}

interface CacheLifetime {}
const NullDraftMode = {}
const CachedDraftModes = new WeakMap<CacheLifetime, Promise<DraftMode>>()

function createDraftModeWithDevWarnings(
  underlyingProvider: null | DraftModeProvider,
  route: undefined | string
): Promise<DraftMode> {
  const instance = new DraftMode(underlyingProvider)
  const promise = Promise.resolve(instance)

  const proxiedPromise = new Proxy(promise, {
    get(target, prop, receiver) {
      switch (prop) {
        case 'isEnabled':
          warnForSyncAccess(route, `\`draftMode().${prop}\``)
          break
        case 'enable':
        case 'disable': {
          warnForSyncAccess(route, `\`draftMode().${prop}()\``)
          break
        }
        default: {
          // We only warn for well-defined properties of the draftMode object.
        }
      }

      return ReflectAdapter.get(target, prop, receiver)
    },
  })

  return proxiedPromise
}

class DraftMode {
  /**
   * @internal - this declaration is stripped via `tsc --stripInternal`
   */
  private readonly _provider: null | DraftModeProvider

  constructor(provider: null | DraftModeProvider) {
    this._provider = provider
  }
  get isEnabled() {
    if (this._provider !== null) {
      return this._provider.isEnabled
    }
    return false
  }
  public enable() {
    // We have a store we want to track dynamic data access to ensure we
    // don't statically generate routes that manipulate draft mode.
    trackDynamicDraftMode('draftMode().enable()', this.enable)
    if (this._provider !== null) {
      this._provider.enable()
    }
  }
  public disable() {
    trackDynamicDraftMode('draftMode().disable()', this.disable)
    if (this._provider !== null) {
      this._provider.disable()
    }
  }
}
const warnForSyncAccess = createDedupedByCallsiteServerErrorLoggerDev(
  createDraftModeAccessError
)

function createDraftModeAccessError(
  route: string | undefined,
  expression: string
) {
  const prefix = route ? `Route "${route}" ` : 'This route '
  return new Error(
    `${prefix}used ${expression}. ` +
      `\`draftMode()\` returns a Promise and must be unwrapped with \`await\` or \`React.use()\` before accessing its properties. ` +
      `Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis`
  )
}

function trackDynamicDraftMode(expression: string, constructorOpt: Function) {
  const workStore = workAsyncStorage.getStore()
  const workUnitStore = workUnitAsyncStorage.getStore()

  if (workStore) {
    // We have a store we want to track dynamic data access to ensure we
    // don't statically generate routes that manipulate draft mode.
    if (workUnitStore?.phase === 'after') {
      throw new Error(
        `Route ${workStore.route} used "${expression}" inside \`after()\`. The enabled status of \`draftMode()\` can be read inside \`after()\` but you cannot enable or disable \`draftMode()\`. See more info here: https://nextjs.org/docs/app/api-reference/functions/after`
      )
    }

    if (workStore.dynamicShouldError) {
      throw new StaticGenBailoutError(
        `Route ${workStore.route} with \`dynamic = "error"\` couldn't be rendered statically because it used \`${expression}\`. See more info here: https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic#dynamic-rendering`
      )
    }

    if (workUnitStore) {
      switch (workUnitStore.type) {
        case 'cache':
        case 'private-cache': {
          const error = new Error(
            `Route ${workStore.route} used "${expression}" inside "use cache". The enabled status of \`draftMode()\` can be read in caches but you must not enable or disable \`draftMode()\` inside a cache. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache`
          )
          Error.captureStackTrace(error, constructorOpt)
          workStore.invalidDynamicUsageError ??= error
          throw error
        }
        case 'unstable-cache':
          throw new Error(
            `Route ${workStore.route} used "${expression}" inside a function cached with \`unstable_cache()\`. The enabled status of \`draftMode()\` can be read in caches but you must not enable or disable \`draftMode()\` inside a cache. See more info here: https://nextjs.org/docs/app/api-reference/functions/unstable_cache`
          )

        case 'prerender':
        case 'prerender-runtime': {
          const error = new Error(
            `Route ${workStore.route} used ${expression} without first calling \`await connection()\`. See more info here: https://nextjs.org/docs/messages/next-prerender-sync-headers`
          )
          return abortAndThrowOnSynchronousRequestDataAccess(
            workStore.route,
            expression,
            error,
            workUnitStore
          )
        }
        case 'prerender-client':
          const exportName = '`draftMode`'
          throw new InvariantError(
            `${exportName} must not be used within a Client Component. Next.js should be preventing ${exportName} from being included in Client Components statically, but did not in this case.`
          )
        case 'prerender-ppr':
          return postponeWithTracking(
            workStore.route,
            expression,
            workUnitStore.dynamicTracking
          )
        case 'prerender-legacy':
          workUnitStore.revalidate = 0

          const err = new DynamicServerError(
            `Route ${workStore.route} couldn't be rendered statically because it used \`${expression}\`. See more info here: https://nextjs.org/docs/messages/dynamic-server-error`
          )
          workStore.dynamicUsageDescription = expression
          workStore.dynamicUsageStack = err.stack

          throw err
        case 'request':
          trackDynamicDataInDynamicRender(workUnitStore)
          break
        default:
          workUnitStore satisfies never
      }
    }
  }
}
