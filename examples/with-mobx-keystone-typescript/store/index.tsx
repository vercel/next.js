import { FC, createContext, useState, useContext } from 'react'
import { useStaticRendering } from 'mobx-react-lite'
import {
  registerRootStore,
  isRootStore,
  SnapshotInOf,
  fromSnapshot,
} from 'mobx-keystone'

import { RootStore } from './root'

// eslint-disable-next-line react-hooks/rules-of-hooks
useStaticRendering(typeof window === 'undefined')

let store: RootStore | null = null

export const initStore = (snapshot?: SnapshotInOf<RootStore>) => {
  if (typeof window === 'undefined') {
    store = new RootStore({})
  }
  if (!store) {
    store = new RootStore({})
  }

  if (snapshot) {
    store = fromSnapshot<RootStore>(snapshot)
  }

  if (!isRootStore(store)) registerRootStore(store)

  return store
}

export const StoreContext = createContext<RootStore | null>(null)

export const StoreProvider: FC<{ snapshot?: SnapshotInOf<RootStore> }> = ({
  children,
  snapshot,
}) => {
  const [ctxStore] = useState(() => initStore(snapshot))
  return (
    <StoreContext.Provider value={ctxStore}>{children}</StoreContext.Provider>
  )
}

export function useStore() {
  const store = useContext(StoreContext)

  if (!store) {
    // this is especially useful in TypeScript so you don't need to be checking for null all the time
    throw new Error('useStore must be used within a StoreProvider.')
  }

  return store
}

export { RootStore }
