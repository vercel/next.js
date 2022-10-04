import React from 'react'

export const HeadManagerContext: React.Context<{
  appDir?: boolean
  updateHead?: (state: any) => void
  mountedInstances?: any
  updateScripts?: (state: any) => void
  scripts?: any
  getIsSsr?: () => boolean
}> = React.createContext({})

if (process.env.NODE_ENV !== 'production') {
  HeadManagerContext.displayName = 'HeadManagerContext'
}
