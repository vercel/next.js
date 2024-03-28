import React, { createContext, useContext } from 'react'
import { PostFullFragment, PublicationFragment } from '../../generated/graphql'

type AppContext = {
  publication: PublicationFragment
  post: PostFullFragment | null
}

const AppContext = createContext<AppContext | null>(null)

const AppProvider = ({
  children,
  publication,
  post,
}: {
  children: React.ReactNode
  publication: PublicationFragment
  post?: PostFullFragment | null
}) => {
  return (
    <AppContext.Provider
      value={{
        publication,
        post: post ?? null,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

const useAppContext = () => {
  const context = useContext(AppContext)

  if (!context) {
    throw new Error('useAppContext must be used within a <AppProvider />')
  }

  return context
}
export { AppProvider, useAppContext }
