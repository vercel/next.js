import { useEffect, useRef } from 'react'

export function useErrorHandler(
  handleOnUnhandledError: (event: WindowEventMap['error']) => void,
  handleOnUnhandledRejection: (
    event: WindowEventMap['unhandledrejection']
  ) => void
) {
  const stacktraceLimitRef = useRef<undefined | number>()

  useEffect(() => {
    try {
      const limit = Error.stackTraceLimit
      Error.stackTraceLimit = 50
      stacktraceLimitRef.current = limit
    } catch {}

    window.addEventListener('error', handleOnUnhandledError)
    window.addEventListener('unhandledrejection', handleOnUnhandledRejection)
    return () => {
      if (stacktraceLimitRef.current !== undefined) {
        try {
          Error.stackTraceLimit = stacktraceLimitRef.current
        } catch {}
        stacktraceLimitRef.current = undefined
      }

      window.removeEventListener('error', handleOnUnhandledError)
      window.removeEventListener(
        'unhandledrejection',
        handleOnUnhandledRejection
      )
    }
  }, [handleOnUnhandledError, handleOnUnhandledRejection])
}
