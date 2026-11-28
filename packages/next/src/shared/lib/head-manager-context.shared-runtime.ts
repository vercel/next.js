import React from 'react'

export const HeadManagerContext: React.Context<{
  updateHead?: (state: any) => void
  mountedInstances?: any
  updateScripts?: (state: any) => void
  scripts?: any
  getIsSsr?: () => boolean

  // Used in app directory, to render script tags as server components.
  appDir?: boolean
  nonce?: string
  // Used in app directory, when the server sent the error shell and the app is
  // rendered on the client without hydrating.
  isClientRenderFallback?: boolean
}> = React.createContext({})

if (process.env.NODE_ENV !== 'production') {
  HeadManagerContext.displayName = 'HeadManagerContext'
}
