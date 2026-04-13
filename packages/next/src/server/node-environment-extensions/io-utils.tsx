import { workAsyncStorage } from '../app-render/work-async-storage.external'
import { workUnitAsyncStorage } from '../app-render/work-unit-async-storage.external'
import { abortOnSynchronousPlatformIOAccess } from '../app-render/dynamic-rendering'
import { RenderStage } from '../app-render/staged-rendering'

import { getServerReact, getClientReact } from '../runtime-reacts.external'

type ApiType = 'time' | 'random' | 'crypto'

const DOCS_URLS = {
  time: 'https://nextjs.org/docs/messages/next-prerender-current-time',
  random: 'https://nextjs.org/docs/messages/next-prerender-random',
  crypto: 'https://nextjs.org/docs/messages/next-prerender-crypto',
} as const

const CLIENT_DOCS_URLS = {
  time: 'https://nextjs.org/docs/messages/next-prerender-current-time-client',
  random: 'https://nextjs.org/docs/messages/next-prerender-random-client',
  crypto: 'https://nextjs.org/docs/messages/next-prerender-crypto-client',
} as const

const RUNTIME_DOCS_URLS = {
  time: 'https://nextjs.org/docs/messages/next-prerender-runtime-current-time',
  random: 'https://nextjs.org/docs/messages/next-prerender-runtime-random',
  crypto: 'https://nextjs.org/docs/messages/next-prerender-runtime-crypto',
} as const

function buildServerMessage(
  route: string,
  expression: string,
  type: ApiType,
  docsUrl: string
): string {
  const performanceHint =
    type === 'time'
      ? ` If you're measuring elapsed time, use \`performance.now()\` instead.\n\n`
      : '\n\n'

  return (
    `Route "${route}" can't be prerendered.\n\n` +
    `Cause: \`${expression}\` was called before any uncached data ` +
    `(e.g. \`fetch()\`) or request-time API (e.g. \`cookies()\`, ` +
    `\`headers()\`, \`connection()\`, \`searchParams\`). ` +
    `Next.js can't determine whether this value should be prerendered ` +
    `or evaluated per-request.\n\n` +
    `Fix: Move this expression into a Client Component, cache the ` +
    `result with "use cache", or move it into a child component ` +
    `that calls \`await connection()\` and is wrapped in <Suspense>.` +
    performanceHint +
    `See more info here: ${docsUrl}`
  )
}

function buildClientMessage(
  route: string,
  expression: string,
  type: ApiType
): string {
  return (
    `Route "${route}" can't be prerendered.\n\n` +
    `Cause: \`${expression}\` was used in a Client Component without a ` +
    `<Suspense> boundary above it.\n\n` +
    `Fix: Add a <Suspense> boundary above the component so the rest ` +
    `of the page can be prerendered.\n\n` +
    `See more info here: ${CLIENT_DOCS_URLS[type]}`
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
        const message = buildServerMessage(
          workStore.route,
          expression,
          type,
          DOCS_URLS[type]
        )

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
        const message = buildClientMessage(workStore.route, expression, type)

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
          message = buildServerMessage(
            workStore.route,
            expression,
            type,
            DOCS_URLS[type]
          )
        } else {
          // We're in the Runtime stage.
          // We only error for Sync IO in the Runtime stage if the route has a runtime prefetch config.
          // This check is implemented in `stageController.canSyncInterrupt()` --
          // if runtime prefetching isn't enabled, then we won't get here.

          message = buildServerMessage(
            workStore.route,
            expression,
            type,
            RUNTIME_DOCS_URLS[type]
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

function applyOwnerStack(error: Error) {
  // TODO: Instead of stitching the stacks here, we should log the original
  // error as-is when it occurs, and let `patchErrorInspect` handle adding the
  // owner stack, instead of logging it deferred in the `LogSafely` component
  // via `throwIfDisallowedDynamic`.
  if (process.env.NODE_ENV !== 'production') {
    const ownerStack =
      getClientReact()?.captureOwnerStack?.() ??
      getServerReact()?.captureOwnerStack?.()

    if (ownerStack) {
      let stack = ownerStack

      if (error.stack) {
        const frames: string[] = []

        for (const frame of error.stack.split('\n').slice(1)) {
          if (frame.includes('react_stack_bottom_frame')) {
            break
          }

          frames.push(frame)
        }

        stack = '\n' + frames.join('\n') + stack
      }

      error.stack = error.name + ': ' + error.message + stack
    }
  }

  return error
}
