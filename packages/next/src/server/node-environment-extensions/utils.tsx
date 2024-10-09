import { workAsyncStorage } from '../../client/components/work-async-storage.external'
import { workUnitAsyncStorage } from '../app-render/work-unit-async-storage.external'
import { abortOnSynchronousDynamicDataAccess } from '../app-render/dynamic-rendering'

export function io(expression: string) {
  const workUnitStore = workUnitAsyncStorage.getStore()
  if (workUnitStore && workUnitStore.type === 'prerender') {
    const workStore = workAsyncStorage.getStore()
    const route = workStore ? workStore.route : ''
    if (workStore) {
      abortOnSynchronousDynamicDataAccess(route, expression, workUnitStore)
    }
  }
}
