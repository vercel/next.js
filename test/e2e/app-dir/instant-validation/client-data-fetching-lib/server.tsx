import 'server-only'
import { CacheIdentifierContext } from './internal-context'

export function DataCacheProvider({ children }) {
  // This object is used as a key a WeakMap of caches.
  // This is a trick to make sure each SSR render gets a separate cache
  // without worrying about client state getting reset due to suspense.
  //
  // It'll be a unique object every time we deserialize this RSC payload,
  // so each client render gets a separate id and thus a separate cache.
  const id = {}
  return <CacheIdentifierContext value={id}>{children}</CacheIdentifierContext>
}
