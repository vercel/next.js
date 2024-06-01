import { pageContextAsyncStorage } from './page-context-async-storage.external'

export const getPageContext = <T>() => {
  return pageContextAsyncStorage.getStore() as T
}
