// @ts-expect-error createServerContext exists on experimental channel
import { createServerContext } from 'react'

// Ensure serverContext is not created more than once as React will throw when creating it more than once
// https://github.com/facebook/react/blob/dd2d6522754f52c70d02c51db25eb7cbd5d1c8eb/packages/react/src/ReactServerContext.js#L101
const createContext = (name: string) => {
  // @ts-expect-error __NEXT_DEV_SERVER_CONTEXT__ is a global
  if (!global.__NEXT_DEV_SERVER_CONTEXT__) {
    // @ts-expect-error __NEXT_DEV_SERVER_CONTEXT__ is a global
    global.__NEXT_DEV_SERVER_CONTEXT__ = {}
  }

  // @ts-expect-error __NEXT_DEV_SERVER_CONTEXT__ is a global
  if (!global.__NEXT_DEV_SERVER_CONTEXT__[name]) {
    // @ts-expect-error __NEXT_DEV_SERVER_CONTEXT__ is a global
    global.__NEXT_DEV_SERVER_CONTEXT__[name] = createServerContext(name, null)
  }

  // @ts-expect-error __NEXT_DEV_SERVER_CONTEXT__ is a global
  return global.__NEXT_DEV_SERVER_CONTEXT__[name]
}

export const HeadersContext = createContext('HeadersContext')
export const PreviewDataContext = createContext('PreviewDataContext')
export const CookiesContext = createContext('CookiesContext')
