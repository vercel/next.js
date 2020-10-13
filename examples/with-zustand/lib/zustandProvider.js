import { createContext, useContext } from 'react'

export const StoreContext = createContext(null)

export const Provider = ({ children, store }) => {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
}

export const useStore = (selector, eqFn) => {
  const value = useContext(StoreContext)

  const values = value(selector, eqFn)

  return values
}
