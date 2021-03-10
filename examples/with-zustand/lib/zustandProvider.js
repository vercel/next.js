import { createContext, useContext } from 'react'

export const StoreContext = createContext(null)

export const StoreProvider = ({ children, store }) => {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
}

export const useStore = (selector, eqFn) => {
  const store = useContext(StoreContext)
  const values = store(selector, eqFn)

  return values
}
