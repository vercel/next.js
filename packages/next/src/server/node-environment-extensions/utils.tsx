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
    if (workUnitStore.type === 'prerender') {
      const workStore = workAsyncStorage.getStore()
      if (workStore) {
        let message: string
        switch (type) {
          case 'time':
            message = `Route "${workStore.route}" used ${expression} instead of using \`performance\` or without explicitly calling \`await connection()\` beforehand. See more info here: https://nextjs.org/docs/messages/next-prerender-current-time`
            break
          case 'random':
            message = `Route "${workStore.route}" used ${expression} outside of \`"use cache"\` and without explicitly calling \`await connection()\` beforehand. See more info here: https://nextjs.org/docs/messages/next-prerender-random`
            break
          case 'crypto':
            message = `Route "${workStore.route}" used ${expression} outside of \`"use cache"\` and without explicitly calling \`await connection()\` beforehand. See more info here: https://nextjs.org/docs/messages/next-prerender-crypto`
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
    } else if (
      workUnitStore.type === 'request' &&
      workUnitStore.prerenderPhase === true
    ) {
      const requestStore = workUnitStore
      trackSynchronousPlatformIOAccessInDev(requestStore)
    }
  }
}
