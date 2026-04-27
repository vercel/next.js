import { workAsyncStorage } from '../app-render/work-async-storage.external'
import { workUnitAsyncStorage } from '../app-render/work-unit-async-storage.external'
import { abortOnSynchronousPlatformIOAccess } from '../app-render/dynamic-rendering'
import { RenderStage } from '../app-render/staged-rendering'
import { applyOwnerStack } from '../dynamic-rendering-utils'

type ApiType = 'time' | 'random' | 'crypto'

const SYNC_IO_DOCS: Record<ApiType, string> = {
  time: 'https://nextjs.org/docs/messages/next-prerender-current-time',
  random: 'https://nextjs.org/docs/messages/next-prerender-random',
  crypto: 'https://nextjs.org/docs/messages/next-prerender-crypto',
}

const SYNC_IO_CLIENT_DOCS: Record<ApiType, string> = {
  time: 'https://nextjs.org/docs/messages/next-prerender-current-time-client',
  random: 'https://nextjs.org/docs/messages/next-prerender-random-client',
  crypto: 'https://nextjs.org/docs/messages/next-prerender-crypto-client',
}

const SYNC_IO_RUNTIME_DOCS: Record<ApiType, string> = {
  time: 'https://nextjs.org/docs/messages/next-prerender-runtime-current-time',
  random: 'https://nextjs.org/docs/messages/next-prerender-runtime-random',
  crypto: 'https://nextjs.org/docs/messages/next-prerender-runtime-crypto',
}

function createSyncIOMessage(
  route: string,
  expression: string,
  type: ApiType
): string {
  return (
    `Route "${route}": Next.js encountered ${expression} during the initial render.\n\n` +
    `Without a prior data access, Next.js doesn't know whether to prerender this value or compute it on each request.\n\n` +
    `Ways to fix this:\n` +
    `  - Add a dynamic data access before this call (e.g. \`await connection()\`)\n` +
    `  - Move the expression into a \`"use client"\` component\n` +
    `  - Move the expression into a \`"use cache"\` component\n\n` +
    `Learn more: ${SYNC_IO_DOCS[type]}`
  )
}

function createSyncIORuntimeMessage(
  route: string,
  expression: string,
  type: ApiType
): string {
  return (
    `Route "${route}": Next.js encountered ${expression} during the initial render.\n\n` +
    `Without a prior data access, Next.js doesn't know whether to prerender this value or compute it on each request.\n\n` +
    `Ways to fix this:\n` +
    `  - Add a dynamic data access before this call (e.g. \`await connection()\`)\n` +
    `  - Move the expression into a \`"use client"\` component\n` +
    `  - Move the expression into a \`"use cache"\` component\n\n` +
    `Learn more: ${SYNC_IO_RUNTIME_DOCS[type]}`
  )
}

export function io(expression: string, type: ApiType) {
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
        const message = createSyncIOMessage(workStore.route, expression, type)

        abortOnSynchronousPlatformIOAccess(
          workStore.route,
          expression,
          applyOwnerStack(new Error(message)),
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
        const docsUrl = SYNC_IO_CLIENT_DOCS[type]
        const message =
          `Route "${workStore.route}": Next.js encountered ${expression} inside a Client Component without a \`<Suspense>\` boundary above it.\n\n` +
          `Without a prior data access, Next.js doesn't know whether to prerender this value or compute it on each request.\n\n` +
          `Ways to fix this:\n` +
          `  - Wrap the Client Component in a \`<Suspense>\` boundary\n` +
          `  - Move the expression into a \`"use cache"\` component\n\n` +
          `Learn more: ${docsUrl}`

        abortOnSynchronousPlatformIOAccess(
          workStore.route,
          expression,
          applyOwnerStack(new Error(message)),
          workUnitStore
        )
      }
      break
    }
    case 'request': {
      const stageController = workUnitStore.stagedRendering
      if (stageController && stageController.shouldTrackSyncInterrupt()) {
        let message: string
        if (
          stageController.currentStage === RenderStage.Static ||
          stageController.currentStage === RenderStage.EarlyStatic
        ) {
          message = createSyncIOMessage(workStore.route, expression, type)
        } else {
          // We're in the Runtime stage.
          // We only error for Sync IO in the Runtime stage if the route has a runtime prefetch config.
          // This check is implemented in `stageController.canSyncInterrupt()` --
          // if runtime prefetching isn't enabled, then we won't get here.
          message = createSyncIORuntimeMessage(
            workStore.route,
            expression,
            type
          )
        }

        const syncIOError = applyOwnerStack(new Error(message))
        stageController.syncInterruptCurrentStageWithReason(syncIOError)

        // A build-time validation render uses a 'request' store type, but may be abortable.
        // If we're in the second, restarted render of the restart-on-cache miss flow,
        // Sync IO is an error, and unlike dev, there's no need to continue the render past the sync IO,
        // so we can abort it.
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
    case 'prerender-ppr':
    case 'prerender-legacy':
    case 'cache':
    case 'private-cache':
    case 'unstable-cache':
    case 'generate-static-params':
      break
    default:
      workUnitStore satisfies never
  }
}
