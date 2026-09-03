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

/**
 * Updates `error.message` and keeps `error.stack` in sync.
 *
 * React function-serialization errors put the `[function …]` / `^^^`
 * annotation in the message (and therefore in the stack prefix). Replacing only
 * the first stack line would leave those annotation lines in place and
 * duplicate them when the new message already includes them.
 */
export function setErrorMessage(error: Error, message: string): void {
  const previousMessage = error.message
  error.message = message

  if (!error.stack) return

  const previousPrefix = `${error.name}: ${previousMessage}`
  const nextPrefix = `${error.name}: ${message}`

  if (error.stack.startsWith(previousPrefix)) {
    error.stack = nextPrefix + error.stack.slice(previousPrefix.length)
    return
  }

  // Fallback when the engine omitted the usual `Name: message` prefix: keep
  // only call-site frames.
  const frameIndex = error.stack.search(/\n\s+at /)
  if (frameIndex === -1) {
    error.stack = nextPrefix
  } else {
    error.stack = nextPrefix + error.stack.slice(frameIndex)
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

  // Prefer stripping a multi-line message prefix when present (e.g. React's
  // function-serialization annotation), then fall back to the first line.
  const messagePrefix = `${error.name}: ${error.message}`
  if (stack.startsWith(messagePrefix)) {
    return stack.slice(messagePrefix.length).replace(/^\n/, '')
  }

  return stack.replace(/^[^\n]*\n/, '')
}

const REACT_FUNCTION_SERIALIZATION_ERROR =
  'Functions cannot be passed directly to Client Components unless you explicitly expose it by marking it with "use server". Or maybe you meant to call this function rather than return it.'

const USE_CACHE_FUNCTION_DOCS_URL =
  'https://nextjs.org/docs/app/api-reference/directives/use-cache'

const USE_CACHE_FUNCTION_SERIALIZATION_HINT = `If this is from \`"use cache"\`, return JSX or serializable data — not a function (including a component reference). See ${USE_CACHE_FUNCTION_DOCS_URL}`

export function formatServerError(error: Error): void {
  if (typeof error?.message !== 'string') return

  if (
    error.message.includes(REACT_FUNCTION_SERIALIZATION_ERROR) &&
    !error.message.includes(USE_CACHE_FUNCTION_DOCS_URL)
  ) {
    setErrorMessage(
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

    setErrorMessage(
      error,
      `${error.message}

${addedMessage}`
    )
    return
  }

  if (error.message.includes('createContext is not a function')) {
    setErrorMessage(
      error,
      'createContext only works in Client Components. Add the "use client" directive at the top of the file to use it. Read more: https://nextjs.org/docs/messages/context-in-server-component'
    )
    return
  }

  for (const clientHook of invalidServerComponentReactHooks) {
    const regex = new RegExp(`\\b${clientHook}\\b.*is not a function`)
    if (regex.test(error.message)) {
      setErrorMessage(
        error,
        `${clientHook} only works in Client Components. Add the "use client" directive at the top of the file to use it. Read more: https://nextjs.org/docs/messages/react-client-hook-in-server-component`
      )
      return
    }
  }
}
