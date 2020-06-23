import React from 'react'

export const HeadManagerContext: React.Context<{
  updateHead?: (state: any) => void
  mountedInstances?: any
}> = React.createContext({})

if (process.env.NODE_ENV !== 'production') {
  HeadManagerContext.displayName = 'HeadManagerContext'
}
