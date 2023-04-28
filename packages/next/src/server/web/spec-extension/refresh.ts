import { actionAsyncStorage } from '../../../client/components/action-async-storage'

export function refresh() {
  const asyncActionStore = actionAsyncStorage.getStore()

  if (asyncActionStore && asyncActionStore.isAction) {
    asyncActionStore.shouldRefresh = true
  } else {
    throw new Error('refresh() can only be called from within a Server Action.')
  }
}
