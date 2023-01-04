const invalidServerComponentReactHooks = [
  'useDeferredValue',
  'useEffect',
  'useImperativeHandle',
  'useInsertionEffect',
  'useLayoutEffect',
  'useReducer',
  'useRef',
  'useState',
  'useSyncExternalStore',
  'useTransition',
]

function setMessage(error: Error, message: string): void {
  error.message = message
  if (error.stack) {
    const lines = error.stack.split('\n')
    lines[0] = message
    error.stack = lines.join('\n')
  }
}

export function formatServerError(error: Error): void {
  if (error.message.includes('createContext is not a function')) {
    setMessage(
      error,
      'createContext only works in Client Components. Add the "use client" directive at the top of the file to use it. Read more: https://nextjs.org/docs/messages/context-in-server-component'
    )
    return
  }

  for (const clientHook of invalidServerComponentReactHooks) {
    if (error.message.includes(`${clientHook} is not a function`)) {
      setMessage(
        error,
        `${clientHook} only works in Client Components. Add the "use client" directive at the top of the file to use it. Read more: https://nextjs.org/docs/messages/react-client-hook-in-server-component`
      )
      return
    }
  }
}
