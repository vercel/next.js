import { workAsyncStorage } from '../app-render/work-async-storage.external'
import { workUnitAsyncStorage } from '../app-render/work-unit-async-storage.external'
import { abortOnSynchronousPlatformIOAccess } from '../app-render/dynamic-rendering'
import { InvariantError } from '../../shared/lib/invariant-error'

type DevCategories = 'time' | 'random' | 'crypto'

export function io(expression: string, devAPICategory: DevCategories) {
  const workUnitStore = workUnitAsyncStorage.getStore()
  if (workUnitStore) {
    if (workUnitStore.type === 'prerender') {
      const workStore = workAsyncStorage.getStore()
      if (workStore) {
        abortOnSynchronousPlatformIOAccess(
          workStore.route,
          expression,
          workUnitStore
        )
      }
    } else if (
      process.env.NODE_ENV === 'development' &&
      workUnitStore.type === 'request' &&
      workUnitStore.environment === 'Prerender'
    ) {
      const workStore = workAsyncStorage.getStore()
      const route = workStore ? workStore.route : ''
      switch (devAPICategory) {
        case 'time': {
          const errorToLog = new Error(
            `Route "${route}" used ${expression} instead of using \`performance\` or without explicitly calling \`await connection()\` beforehand. See more info here: https://nextjs.org/docs/messages/next-prerender-current-time`
          )
          console.error(errorToLog)
          break
        }
        case 'random': {
          const errorToLog = new Error(
            `Route ${route} used ${expression} outside of \`"use cache"\` and without explicitly calling \`await connection()\` beforehand. See more info here: https://nextjs.org/docs/messages/next-prerender-random`
          )
          console.error(errorToLog)
          break
        }
        case 'crypto': {
          const errorToLog = new Error(
            `Route ${route} used ${expression} outside of \`"use cache"\` and without explicitly calling \`await connection()\` beforehand. See more info here: https://nextjs.org/docs/messages/next-prerender-crypto`
          )
          console.error(errorToLog)
          break
        }
        default:
          throw new InvariantError('Unknown devAPICategory in io function.')
      }
    }
  }
}
