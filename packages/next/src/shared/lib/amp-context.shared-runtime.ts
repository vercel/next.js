import React from 'react'

export const AmpStateContext: React.Context<any> = React.createContext({})

if (process.env.NODE_ENV !== 'production') {
  AmpStateContext.displayName = 'AmpStateContext'
}
