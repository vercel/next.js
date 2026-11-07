'use client'

import {
  createContext,
  useContext,
  useState,
  useSyncExternalStore,
} from 'react'
import type { ReactNode } from 'react'

function createNotFoundMetadataStore(url: string) {
  // The head and the root access boundary are siblings. Publish the boundary's
  // committed state so metadata switches without updating a sibling in render.
  let notFound = false
  const listeners = new Set<() => void>()

  function notify() {
    for (const listener of listeners) listener()
  }

  return {
    url,
    getSnapshot: () => notFound,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    setNotFound(value: boolean) {
      if (notFound !== value) {
        notFound = value
        notify()
      }
    },
  }
}

export type NotFoundMetadataStore = ReturnType<
  typeof createNotFoundMetadataStore
>
export const NotFoundMetadataContext =
  createContext<NotFoundMetadataStore | null>(null)

export function NotFoundMetadataProvider({
  url,
  children,
}: {
  url: string
  children: ReactNode
}) {
  const [store, setStore] = useState(() => createNotFoundMetadataStore(url))
  // Hidden Activity trees can retain old error boundaries. Start each URL
  // with normal metadata and let only its active boundary select the fallback.
  const value = store.url === url ? store : createNotFoundMetadataStore(url)
  if (value !== store) setStore(value)
  return (
    <NotFoundMetadataContext.Provider value={value}>
      {children}
    </NotFoundMetadataContext.Provider>
  )
}

const getServerSnapshot = () => false

export function NotFoundMetadata({
  children,
  fallback,
}: {
  children: ReactNode
  fallback: ReactNode
}) {
  const store = useContext(NotFoundMetadataContext)
  // Metadata is also rendered independently when collecting segment data.
  const notFound = useSyncExternalStore(
    store?.subscribe ?? subscribeWithoutProvider,
    store?.getSnapshot ?? getServerSnapshot,
    getServerSnapshot
  )
  return notFound ? fallback : children
}

function subscribeWithoutProvider() {
  return () => {}
}
