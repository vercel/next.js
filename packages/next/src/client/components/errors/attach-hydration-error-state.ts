import {
  isHydrationError,
  getDefaultHydrationErrorMessage,
} from '../is-hydration-error'
import {
  hydrationErrorState,
  getReactHydrationDiffSegments,
} from './hydration-error-info'

export function attachHydrationErrorState(error: Error) {
  if (
    isHydrationError(error) &&
    !error.message.includes(
      'https://nextjs.org/docs/messages/react-hydration-error'
    )
  ) {
    const reactHydrationDiffSegments = getReactHydrationDiffSegments(
      error.message
    )
    let parsedHydrationErrorState: typeof hydrationErrorState = {}
    if (reactHydrationDiffSegments) {
      parsedHydrationErrorState = {
        ...(error as any).details,
        ...hydrationErrorState,
        warning: hydrationErrorState.warning || [
          getDefaultHydrationErrorMessage(),
        ],
        notes: reactHydrationDiffSegments[0],
        reactOutputComponentDiff: reactHydrationDiffSegments[1],
      }
    } else {
      // If there's any extra information in the error message to display,
      // append it to the error message details property
      if (hydrationErrorState.warning) {
        // The patched console.error found hydration errors logged by React
        // Append the logged warning to the error message
        parsedHydrationErrorState = {
          ...(error as any).details,
          // It contains the warning, component stack, server and client tag names
          ...hydrationErrorState,
        }
      }
    }
    ;(error as any).details = parsedHydrationErrorState
  }
}
