// @ts-expect-error createServerContext exists on experimental channel
import { createServerContext } from 'react'

// createServerContext exists in react@experimental + react-dom@experimental
if (typeof createServerContext === 'undefined') {
  throw new Error(
    '"app" directory requires React.createServerContext which is not available in the version of React you are using. Please update to react@experimental and react-dom@experimental.'
  )
}

export const DYNAMIC_ERROR_CODE = 'DYNAMIC_SERVER_USAGE'

export class DynamicServerError extends Error {
  digest: typeof DYNAMIC_ERROR_CODE = DYNAMIC_ERROR_CODE

  constructor(type: string) {
    super(`Dynamic server usage: ${type}`)
  }
}
