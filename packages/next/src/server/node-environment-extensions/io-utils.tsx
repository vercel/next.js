import { workAsyncStorage } from '../app-render/work-async-storage.external'
import { workUnitAsyncStorage } from '../app-render/work-unit-async-storage.external'
import type { SyncIOApiType } from '../app-render/sync-io-messages'

// The modules below are only needed once a prerender or a staged render
// observes synchronous IO. They are loaded on demand so that servers which
// never do (most requests in production) don't pay for them at startup.
let dynamicRendering:
  | typeof import('../app-render/dynamic-rendering')
  | undefined
function loadDynamicRendering() {
  return (dynamicRendering ??=
    require('../app-render/dynamic-rendering') as typeof import('../app-render/dynamic-rendering'))
}
let dynamicRenderingUtils:
  | typeof import('../dynamic-rendering-utils')
  | undefined
function loadDynamicRenderingUtils() {
  return (dynamicRenderingUtils ??=
    require('../dynamic-rendering-utils') as typeof import('../dynamic-rendering-utils'))
}
let syncIOMessages: typeof import('../app-render/sync-io-messages') | undefined
function loadSyncIOMessages() {
  return (syncIOMessages ??=
    require('../app-render/sync-io-messages') as typeof import('../app-render/sync-io-messages'))
}

export function io(expression: string, type: SyncIOApiType) {
  const workUnitStore = workUnitAsyncStorage.getStore()
  const workStore = workAsyncStorage.getStore()

  if (!workUnitStore || !workStore) {
    return
  }

  switch (workUnitStore.type) {
    case 'prerender':
    case 'prerender-runtime': {
      const prerenderSignal = workUnitStore.controller.signal

      if (prerenderSignal.aborted === false) {
        // If the prerender signal is already aborted we don't need to construct
        // any stacks because something else actually terminated the prerender.
        // TODO: synchronize this with `stageController`
        loadDynamicRendering().abortOnSynchronousPlatformIOAccess(
          workStore.route,
          expression,
          loadDynamicRenderingUtils().applyOwnerStack(
            loadSyncIOMessages().createSyncIOError(
              workStore.route,
              expression,
              type
            )
          ),
          workUnitStore
        )
      }
      break
    }
    case 'prerender-client': {
      const prerenderSignal = workUnitStore.controller.signal

      if (prerenderSignal.aborted === false) {
        // If the prerender signal is already aborted we don't need to construct
        // any stacks because something else actually terminated the prerender.
        loadDynamicRendering().abortOnSynchronousPlatformIOAccess(
          workStore.route,
          expression,
          loadDynamicRenderingUtils().applyOwnerStack(
            loadSyncIOMessages().createSyncIOClientError(
              workStore.route,
              expression,
              type
            )
          ),
          workUnitStore
        )
      }
      break
    }
    case 'request': {
      const stageController = workUnitStore.stagedRendering
      if (stageController && stageController.shouldTrackSyncInterrupt()) {
        const { RenderStage } =
          require('../app-render/staged-rendering') as typeof import('../app-render/staged-rendering')
        const { createSyncIOError, createSyncIORuntimeError } =
          loadSyncIOMessages()
        let syncIOError: Error
        // NOTE: keep stages where we can interrupt in sync with
        // `shouldTrackSyncInterrupt`/`syncInterruptCurrentStageWithReason`
        switch (stageController.currentStage) {
          case RenderStage.ShellStatic:
          case RenderStage.PrefetchStatic_prefetchApi:
          case RenderStage.PrefetchStatic:
          case RenderStage.NavigationStatic: {
            syncIOError = createSyncIOError(workStore.route, expression, type)
            break
          }
          case RenderStage.ShellRuntime:
          case RenderStage.PrefetchRuntime_prefetchApi:
          case RenderStage.PrefetchRuntime:
          case RenderStage.NavigationRuntime: {
            // We're in a runtime stage.
            // We only error for Sync IO in runtime stages if the route has partialPrefetching enabled.
            syncIOError = createSyncIORuntimeError(
              workStore.route,
              expression,
              type
            )
            break
          }
          case RenderStage.Before:
          case RenderStage.Dynamic:
          case RenderStage.Abandoned: {
            const { InvariantError } =
              require('../../shared/lib/invariant-error') as typeof import('../../shared/lib/invariant-error')
            throw new InvariantError(
              `shouldTrackSyncInterrupt allowed a sync IO interrupt in an unexpected stage: ${RenderStage[stageController.currentStage]}`
            )
          }
        }

        syncIOError = loadDynamicRenderingUtils().applyOwnerStack(syncIOError)
        stageController.syncInterruptCurrentStageWithReason(syncIOError)

        // A validation render uses a 'request' store type, but may be abortable.
        // If we're rendering with filled caches, Sync IO is an error and should trigger an abort.
        if (
          workUnitStore.controller &&
          !workUnitStore.controller.signal.aborted
        ) {
          workUnitStore.controller.abort(syncIOError)
        }
      }
      break
    }
    case 'validation-client':
    case 'prerender-legacy':
    case 'cache':
    case 'private-cache':
    case 'unstable-cache':
    case 'build-time-generator':
      break
    default:
      workUnitStore satisfies never
  }
}
