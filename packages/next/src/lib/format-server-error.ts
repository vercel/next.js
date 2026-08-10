const invalidServerComponentReactHooks = [
  'useDeferredValue',
  'useEffect',
  'useEffectEvent',
  'useImperativeHandle',
  'useInsertionEffect',
  'useLayoutEffect',
  'useReducer',
  'useRef',
  'useState',
  'useSyncExternalStore',
  'useTransition',
  'experimental_useOptimistic',
  'useOptimistic',
]

function setMessage(error: Error, message: string): void {
  error.message = message
  if (error.stack) {
    const lines = error.stack.split('\n')
    lines[0] = message
    error.stack = lines.join('\n')
  }
}

/**
 * Input:
 * Error: Something went wrong
    at funcName (/path/to/file.js:10:5)
    at anotherFunc (/path/to/file.js:15:10)
 
 * Output:
    at funcName (/path/to/file.js:10:5)
    at anotherFunc (/path/to/file.js:15:10) 
 */
export function getStackWithoutErrorMessage(error: Error): string {
  const stack = error.stack
  if (!stack) return ''
  return stack.replace(/^[^\n]*\n/, '')
}

const REACT_FUNCTION_SERIALIZATION_ERROR =
  'Functions cannot be passed directly to Client Components unless you explicitly expose it by marking it with "use server". Or maybe you meant to call this function rather than return it.'

const USE_CACHE_FUNCTION_SERIALIZATION_HINT =
  'If this error occurred inside `"use cache"`, that directive is a serialization boundary — functions (including React components) cannot be passed in or returned. Return JSX (for example `<Component />`) or serializable data instead. Read more: https://nextjs.org/docs/messages/use-cache-function'

export function formatServerError(error: Error): void {
  if (typeof error?.message !== 'string') return

  if (
    error.message.includes(REACT_FUNCTION_SERIALIZATION_ERROR) &&
    !error.message.includes(
      'https://nextjs.org/docs/messages/use-cache-function'
    )
  ) {
    setMessage(
      error,
      `${error.message}

${USE_CACHE_FUNCTION_SERIALIZATION_HINT}`
    )
    return
  }

  if (
    error.message.includes(
      'Class extends value undefined is not a constructor or null'
    )
  ) {
    const addedMessage =
      'This might be caused by a React Class Component being rendered in a Server Component, React Class Components only works in Client Components. Read more: https://nextjs.org/docs/messages/class-component-in-server-component'

    // If this error instance already has the message, don't add it again
    if (error.message.includes(addedMessage)) return

    setMessage(
      error,
      `${error.message}

${addedMessage}`
    )
    return
  }

  if (error.message.includes('createContext is not a function')) {
    setMessage(
      error,
      'createContext only works in Client Components. Add the "use client" directive at the top of the file to use it. Read more: https://nextjs.org/docs/messages/context-in-server-component'
    )
    return
  }

  for (const clientHook of invalidServerComponentReactHooks) {
    const regex = new RegExp(`\\b${clientHook}\\b.*is not a function`)
    if (regex.test(error.message)) {
      setMessage(
        error,
        `${clientHook} only works in Client Components. Add the "use client" directive at the top of the file to use it. Read more: https://nextjs.org/docs/messages/react-client-hook-in-server-component`
      )
      return
    }
  }
}
