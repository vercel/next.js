import * as React from 'react'

export const RequestContext: React.Context<any> = React.createContext(null)

if (process.env.NODE_ENV !== 'production') {
  RequestContext.displayName = 'RequestContext'
}
