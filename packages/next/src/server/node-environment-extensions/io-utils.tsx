import { workAsyncStorage } from '../app-render/work-async-storage.external'
import { workUnitAsyncStorage } from '../app-render/work-unit-async-storage.external'
import type { SyncIOApiType } from '../app-render/sync-io-messages'
import { InvariantError } from '../../shared/lib/invariant-error'

// Everything that reporting a synchronous IO access needs is behind
// `./sync-io-reporting`. It is loaded the first time a prerender or a staged
// render observes one, so that servers which never do don't load it at startup.
let syncIOReporting: typeof import('./sync-io-reporting') | undefined
function loadSyncIOReporting() {
  return (syncIOReporting ??=
    require('./sync-io-reporting') as typeof import('./sync-io-reporting'))
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
        const {
          abortOnSynchronousPlatformIOAccess,
          applyOwnerStack,
          createSyncIOError,
        } = loadSyncIOReporting()
        abortOnSynchronousPlatformIOAccess(
          workStore.route,
          expression,
          applyOwnerStack(createSyncIOError(workStore.route, expression, type)),
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
        const {
          abortOnSynchronousPlatformIOAccess,
          applyOwnerStack,
          createSyncIOClientError,
        } = loadSyncIOReporting()
        abortOnSynchronousPlatformIOAccess(
          workStore.route,
          expression,
          applyOwnerStack(
            createSyncIOClientError(workStore.route, expression, type)
          ),
          workUnitStore
        )
      }
      break
    }
    case 'request': {
      const stageController = workUnitStore.stagedRendering
      if (stageController && stageController.shouldTrackSyncInterrupt()) {
        const {
          RenderStage,
          applyOwnerStack,
          createSyncIOError,
          createSyncIORuntimeError,
        } = loadSyncIOReporting()
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
            throw new InvariantError(
              `shouldTrackSyncInterrupt allowed a sync IO interrupt in an unexpected stage: ${RenderStage[stageController.currentStage]}`
            )
          }
        }

        syncIOError = applyOwnerStack(syncIOError)
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
