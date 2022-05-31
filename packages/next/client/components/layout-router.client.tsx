import React from 'react'
import { AppRouterContext } from '../../shared/lib/app-router-context'
import { fetchServerResponse } from './app-router.client.js'

// TODO: move to client component when handling is implemented
export default function LayoutRouter({
  initialUrl,
  layoutPath,
  children,
}: any) {
  const initialState = {
    url: initialUrl,
  }
  const previousUrlRef = React.useRef(initialState)
  const [current, setCurrent] = React.useState(initialState)
  const change = React.useCallback(
    (method: 'replaceState' | 'pushState', url: string) => {
      previousUrlRef.current = current
      const state = { ...current, url }
      setCurrent(state)
      // TODO: update url eagerly or not?
      window.history[method](state, '', url)
    },
    [current]
  )
  const appRouter = React.useMemo(() => {
    return {
      prefetch: () => Promise.resolve({}),
      replace: (url: string) => {
        return change('replaceState', url)
      },
      push: (url: string) => {
        return change('pushState', url)
      },
      url: current.url,
    }
  }, [current, change])

  let root
  if (current.url !== previousUrlRef.current?.url) {
    // eslint-disable-next-line
    const data = fetchServerResponse(current.url, layoutPath)
    root = data.readRoot()
  }
  return (
    <AppRouterContext.Provider value={appRouter}>
      {root ? root : children}
    </AppRouterContext.Provider>
  )
}
