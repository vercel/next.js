import * as React from 'react'

export const HeadManagerContext: React.Context<any> = React.createContext(null)

if (process.env.NODE_ENV !== 'production') {
  HeadManagerContext.displayName = 'HeadManagerContext'
}
