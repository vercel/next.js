import { useEffect } from 'react'
import { createHrefFromUrl } from './router-reducer/create-href-from-url'

export function handleHardNavError(error: unknown): boolean {
  if (
    error &&
    typeof window !== 'undefined' &&
    window.next.__pendingUrl &&
    createHrefFromUrl(new URL(window.location.href)) !==
      createHrefFromUrl(window.next.__pendingUrl)
  ) {
    console.error(
      `Error occurred during navigation, falling back to hard navigation`,
      error
    )
    window.location.href = window.next.__pendingUrl.toString()
    return true
  }
  return false
}

export function useNavFailureHandler() {
  if (process.env.__NEXT_APP_NAV_FAIL_HANDLING) {
    // this if is only for DCE of the feature flag not conditional
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {
      const uncaughtExceptionHandler = (
        evt: ErrorEvent | PromiseRejectionEvent
      ) => {
        const error = 'reason' in evt ? evt.reason : evt.error
        // if we have an unhandled exception/rejection during
        // a navigation we fall back to a hard navigation to
        // attempt recovering to a good state
        handleHardNavError(error)
      }
      window.addEventListener('unhandledrejection', uncaughtExceptionHandler)
      window.addEventListener('error', uncaughtExceptionHandler)
      return () => {
        window.removeEventListener('error', uncaughtExceptionHandler)
        window.removeEventListener(
          'unhandledrejection',
          uncaughtExceptionHandler
        )
      }
    }, [])
  }
}
