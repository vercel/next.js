import { workAsyncStorage } from '../app-render/work-async-storage.external'
import { workUnitAsyncStorage } from '../app-render/work-unit-async-storage.external'
import { abortOnSynchronousPlatformIOAccess } from '../app-render/dynamic-rendering'
import { InvariantError } from '../../shared/lib/invariant-error'
import { RenderStage } from '../app-render/staged-rendering'

import { getServerReact, getClientReact } from '../runtime-reacts.external'

type ApiType = 'time' | 'random' | 'crypto'

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
        let message: string
        switch (type) {
          case 'time':
            message = `Route "${workStore.route}" used ${expression} before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing the current time in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-current-time`
            break
          case 'random':
            message = `Route "${workStore.route}" used ${expression} before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random`
            break
          case 'crypto':
            message = `Route "${workStore.route}" used ${expression} before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random cryptographic values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-crypto`
            break
          default:
            throw new InvariantError(
              'Unknown expression type in abortOnSynchronousPlatformIOAccess.'
            )
        }

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
        let message: string
        switch (type) {
          case 'time':
            message = `Route "${workStore.route}" used ${expression} inside a Client Component without a Suspense boundary above it. See more info here: https://nextjs.org/docs/messages/next-prerender-current-time-client`
            break
          case 'random':
            message = `Route "${workStore.route}" used ${expression} inside a Client Component without a Suspense boundary above it. See more info here: https://nextjs.org/docs/messages/next-prerender-random-client`
            break
          case 'crypto':
            message = `Route "${workStore.route}" used ${expression} inside a Client Component without a Suspense boundary above it. See more info here: https://nextjs.org/docs/messages/next-prerender-crypto-client`
            break
          default:
            throw new InvariantError(
              'Unknown expression type in abortOnSynchronousPlatformIOAccess.'
            )
        }

        abortOnSynchronousPlatformIOAccess(
          workStore.route,
          expression,
          applyOwnerStack(new Error(message)),
          workUnitStore
        )
      }
      break
    }
    case 'request':
      if (process.env.NODE_ENV === 'development') {
        const stageController = workUnitStore.stagedRendering
        if (stageController && stageController.canSyncInterrupt()) {
          let message: string
          if (stageController.currentStage === RenderStage.Static) {
            switch (type) {
              case 'time':
                message = `Route "${workStore.route}" used ${expression} before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing the current time in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-current-time`
                break
              case 'random':
                message = `Route "${workStore.route}" used ${expression} before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-random`
                break
              case 'crypto':
                message = `Route "${workStore.route}" used ${expression} before accessing either uncached data (e.g. \`fetch()\`) or Request data (e.g. \`cookies()\`, \`headers()\`, \`connection()\`, and \`searchParams\`). Accessing random cryptographic values synchronously in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-crypto`
                break
              default:
                throw new InvariantError(
                  'Unknown expression type in abortOnSynchronousPlatformIOAccess.'
                )
            }
          } else {
            // We're in the Runtime stage.
            // We only error for Sync IO in the Runtime stage if the route has a runtime prefetch config.
            // This check is implemented in `stageController.canSyncInterrupt()` --
            // if runtime prefetching isn't enabled, then we won't get here.

            let accessStatement: string
            let additionalInfoLink: string

            switch (type) {
              case 'time':
                accessStatement = 'the current time'
                additionalInfoLink =
                  'https://nextjs.org/docs/messages/next-prerender-runtime-current-time'
                break
              case 'random':
                accessStatement = 'random values synchronously'
                additionalInfoLink =
                  'https://nextjs.org/docs/messages/next-prerender-runtime-random'
                break
              case 'crypto':
                accessStatement = 'random cryptographic values synchronously'
                additionalInfoLink =
                  'https://nextjs.org/docs/messages/next-prerender-runtime-crypto'
                break
              default:
                throw new InvariantError(
                  'Unknown expression type in abortOnSynchronousPlatformIOAccess.'
                )
            }

            message = `Route "${workStore.route}" used ${expression} before accessing either uncached data (e.g. \`fetch()\`) or awaiting \`connection()\`. When configured for Runtime prefetching, accessing ${accessStatement} in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: ${additionalInfoLink}`
          }

          const syncIOError = applyOwnerStack(new Error(message))
          stageController.syncInterruptCurrentStageWithReason(syncIOError)
        }
      }
      break
    case 'prerender-ppr':
    case 'prerender-legacy':
    case 'cache':
    case 'private-cache':
    case 'unstable-cache':
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
      getClientReact()?.captureOwnerStack() ??
      getServerReact()?.captureOwnerStack()

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
