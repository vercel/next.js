import React from 'react'
export default function useRouter(initialUrl: string): any {
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

  return [appRouter, previousUrlRef, current, change]
}
