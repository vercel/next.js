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
