import {
  getDefaultHydrationErrorMessage,
  isHydrationError,
  testReactHydrationWarning,
} from '../is-hydration-error'
import {
  hydrationErrorState,
  getReactHydrationDiffSegments,
} from './hydration-error-info'

export function attachHydrationErrorState(error: Error) {
  const reactHydrationDiffSegments = getReactHydrationDiffSegments(
    error.message
  )
  let parsedHydrationErrorState: typeof hydrationErrorState = {}
  const isHydrationWarning = testReactHydrationWarning(error.message)
  const isHydrationRuntimeError = isHydrationError(error)
  // If the reactHydrationDiffSegments exists
  // and the diff (reactHydrationDiffSegments[1]) exists
  // e.g. the hydration diff log error.
  if (reactHydrationDiffSegments) {
    const diff = reactHydrationDiffSegments[1]
    parsedHydrationErrorState = {
      ...(error as any).details,
      ...hydrationErrorState,
      // If diff is present in error, we don't need to pick up the console logged warning.
      // - if hydration error has diff, and is not hydration diff log, then it's a normal hydration error.
      // - if hydration error no diff, then leverage the one from the hydration diff log.

      warning: (diff && !isHydrationWarning
        ? null
        : hydrationErrorState.warning) || [getDefaultHydrationErrorMessage()],
      // When it's hydration diff log, do not show notes section.
      // This condition is only for the 1st squashed error.
      notes: isHydrationWarning ? '' : reactHydrationDiffSegments[0],
      reactOutputComponentDiff: diff,
    }
    // Cache the `reactOutputComponentDiff` into hydrationErrorState.
    // This is only required for now when we still squashed the hydration diff log into hydration error.
    // Once the all error is logged to dev overlay in order, this will go away.
    if (!hydrationErrorState.reactOutputComponentDiff && diff) {
      hydrationErrorState.reactOutputComponentDiff = diff
    }
    // If it's hydration runtime error that doesn't contain the diff, combine the diff from the cached hydration diff.
    if (
      !diff &&
      isHydrationRuntimeError &&
      hydrationErrorState.reactOutputComponentDiff
    ) {
      parsedHydrationErrorState.reactOutputComponentDiff =
        hydrationErrorState.reactOutputComponentDiff
    }
  } else {
    // Normal runtime error, where it doesn't contain the hydration diff.

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
    // Consume the cached hydration diff.
    // This is only required for now when we still squashed the hydration diff log into hydration error.
    // Once the all error is logged to dev overlay in order, this will go away.
    if (hydrationErrorState.reactOutputComponentDiff) {
      parsedHydrationErrorState.reactOutputComponentDiff =
        hydrationErrorState.reactOutputComponentDiff
    }
  }
  ;(error as any).details = parsedHydrationErrorState
}
