import React from 'react'

const PromiseCacheContext = React.createContext(null)

export const cache = new Map()
export const PromiseCacheProvider = PromiseCacheContext.Provider

export function useCachedPromise(key, fn, thrown = false) {
  const cache = React.useContext(PromiseCacheContext)

  if (!thrown) return undefined
  let entry = cache.get(key)
  if (!entry) {
    entry = {
      status: 'PENDING',
      value: fn().then(
        (value) => {
          cache.set(key, {
            status: 'RESOLVED',
            value,
          })
        },
        (err) => {
          cache.set(key, {
            status: 'REJECTED',
            value: err,
          })
        }
      ),
    }
    cache.set(key, entry)
  }
  if (['PENDING', 'REJECTED'].includes(entry.status)) {
    throw entry.value
  }
  return entry.value
}
