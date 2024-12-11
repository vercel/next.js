import {
  // isHydrationError,
  getDefaultHydrationErrorMessage,
} from '../is-hydration-error'
import {
  // hydrationErrorState,
  type HydrationErrorState,
  getReactHydrationDiffSegments,
} from './hydration-error-info'

export function attachHydrationErrorState(
  error: Error,
  hydrationErrorStatePayload: HydrationErrorState | null
) {
  // console.log('attachHydrationErrorState', isHydrationError(error))
  // if (
  //   isHydrationError(error) // &&
  //   // !error.message.includes(
  //   //   'https://nextjs.org/docs/messages/react-hydration-error'
  //   // )
  // ) {
  // }

  const reactHydrationDiffSegments = getReactHydrationDiffSegments(
    error.message
  )

  // if it's hydration warning
  let parsedHydrationErrorState: HydrationErrorState = {}
  if (reactHydrationDiffSegments) {
    parsedHydrationErrorState = {
      // ...(error as any).details,
      // ...hydrationErrorStatePayload,
      // componentStack,
      warning:
        hydrationErrorStatePayload?.warning ||
        ([getDefaultHydrationErrorMessage(), '', ''] as [
          string,
          string,
          string,
        ]),
      notes: reactHydrationDiffSegments[0],
      componentStack: reactHydrationDiffSegments[1],
    }
  } else {
    // If there's any extra information in the error message to display,
    // append it to the error message details property
    if (hydrationErrorStatePayload?.warning) {
      // The patched console.error found hydration errors logged by React
      // Append the logged warning to the error message
      parsedHydrationErrorState = {
        // ...(error as any).details,
        // It contains the warning, component stack, server and client tag names
        ...hydrationErrorStatePayload,
      }
    }
  }
  ;(error as any).details = parsedHydrationErrorState
}
