import { staticGenerationAsyncStorage } from './static-generation-async-storage.external'

export const getParams = () => {
  const store = staticGenerationAsyncStorage.getStore()

  if (!store) return null

  const { params } = store

  return params
}
