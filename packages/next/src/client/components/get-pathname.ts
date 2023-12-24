import { staticGenerationAsyncStorage } from './static-generation-async-storage.external'
import { hasBasePath } from '../has-base-path'
import { removeBasePath } from '../remove-base-path'
import { serverGetterInClientComponentError } from './server-getter-in-client-component-error'

export function getPathname() {
  serverGetterInClientComponentError('getPathname')

  const store = staticGenerationAsyncStorage.getStore()

  if (!store) return null

  const { urlPathname } = store
  const url = new URL(urlPathname, 'http://n')

  const pathname = hasBasePath(url.pathname)
    ? removeBasePath(url.pathname)
    : url.pathname

  return pathname
}
