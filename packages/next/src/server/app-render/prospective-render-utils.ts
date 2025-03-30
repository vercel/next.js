import { getDigestForWellKnownError } from './create-error-handler'

export function printDebugThrownValueForProspectiveRender(
  thrownValue: unknown,
  route: string
) {
  // We don't need to print well-known Next.js errors.
  if (getDigestForWellKnownError(thrownValue)) {
    return
  }

  let message: undefined | string
  if (
    typeof thrownValue === 'object' &&
    thrownValue !== null &&
    typeof (thrownValue as any).message === 'string'
  ) {
    message = (thrownValue as any).message
    if (typeof (thrownValue as any).stack === 'string') {
      const originalErrorStack: string = (thrownValue as any).stack
      const stackStart = originalErrorStack.indexOf('\n')
      if (stackStart > -1) {
        const error = new Error(
          `Route ${route} errored during the prospective render. These errors are normally ignored and may not prevent the route from prerendering but are logged here because build debugging is enabled.
          
Original Error: ${message}`
        )
        error.stack =
          'Error: ' + error.message + originalErrorStack.slice(stackStart)
        console.error(error)
        return
      }
    }
  } else if (typeof thrownValue === 'string') {
    message = thrownValue
  }

  if (message) {
    console.error(`Route ${route} errored during the prospective render. These errors are normally ignored and may not prevent the route from prerendering but are logged here because build debugging is enabled. No stack was provided.
          
Original Message: ${message}`)
    return
  }

  console.error(
    `Route ${route} errored during the prospective render. These errors are normally ignored and may not prevent the route from prerendering but are logged here because build debugging is enabled. The thrown value is logged just following this message`
  )
  console.error(thrownValue)
  return
}
