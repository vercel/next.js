import { workAsyncStorage } from '../app-render/work-async-storage.external'
import { workUnitAsyncStorage } from '../app-render/work-unit-async-storage.external'
import {
  abortOnSynchronousPlatformIOAccess,
  trackSynchronousPlatformIOAccessInDev,
} from '../app-render/dynamic-rendering'
import { InvariantError } from '../../shared/lib/invariant-error'

type ApiType = 'time' | 'random' | 'crypto'

export function io(expression: string, type: ApiType) {
  const workUnitStore = workUnitAsyncStorage.getStore()
  if (workUnitStore) {
    let isClient = false
    if (
      workUnitStore.type === 'prerender' ||
      (isClient = workUnitStore.type === 'prerender-client')
    ) {
      const prerenderSignal = workUnitStore.controller.signal
      if (prerenderSignal.aborted === false) {
        // If the prerender signal is already aborted we don't need to construct any stacks
        // because something else actually terminated the prerender.
        const workStore = workAsyncStorage.getStore()
        if (workStore) {
          let message: string
          switch (type) {
            case 'time':
              message = isClient
                ? `Route "${workStore.route}" used ${expression} inside a Client Component without a Suspense boundary above it. See more info here: https://nextjs.org/docs/messages/next-prerender-current-time-client`
                : `Route "${workStore.route}" used ${expression} instead of using \`performance\` or without explicitly calling \`await connection()\` beforehand. See more info here: https://nextjs.org/docs/messages/next-prerender-current-time`
              break
            case 'random':
              message = isClient
                ? `Route "${workStore.route}" used ${expression} inside a Client Component without a Suspense boundary above it. See more info here: https://nextjs.org/docs/messages/next-prerender-random-client`
                : `Route "${workStore.route}" used ${expression} outside of \`"use cache"\` and without explicitly calling \`await connection()\` beforehand. See more info here: https://nextjs.org/docs/messages/next-prerender-random`
              break
            case 'crypto':
              message = isClient
                ? `Route "${workStore.route}" used ${expression} inside a Client Component without a Suspense boundary above it. See more info here: https://nextjs.org/docs/messages/next-prerender-crypto-client`
                : `Route "${workStore.route}" used ${expression} outside of \`"use cache"\` and without explicitly calling \`await connection()\` beforehand. See more info here: https://nextjs.org/docs/messages/next-prerender-crypto`
              break
            default:
              throw new InvariantError(
                'Unknown expression type in abortOnSynchronousPlatformIOAccess.'
              )
          }

          const errorWithStack = new Error(message)

          if (
            process.env.NODE_ENV !== 'production' &&
            workUnitStore.captureOwnerStack
          ) {
            const ownerStack = workUnitStore.captureOwnerStack()

            if (ownerStack) {
              // TODO: Instead of stitching the stacks here, we should log the
              // original error as-is when it occurs (i.e. here), and let
              // `patchErrorInspect` handle adding the owner stack, instead of
              // logging it deferred in the `LogSafely` component via
              // `throwIfDisallowedDynamic`.
              applyOwnerStack(errorWithStack, ownerStack)
            }
          }

          abortOnSynchronousPlatformIOAccess(
            workStore.route,
            expression,
            errorWithStack,
            workUnitStore
          )
        }
      }
    } else if (
      workUnitStore.type === 'request' &&
      workUnitStore.prerenderPhase === true
    ) {
      const requestStore = workUnitStore
      trackSynchronousPlatformIOAccessInDev(requestStore)
    }
  }
}

function applyOwnerStack(error: Error, ownerStack: string) {
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
