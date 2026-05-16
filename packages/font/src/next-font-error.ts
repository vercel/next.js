/**
 * Throw NextFontError error. Used by the WellKnownErrorsPlugin to format errors thrown by next/font.
 */
export function nextFontError(message: string): never {
  const err = new Error(message)
  err.name = 'NextFontError'
  throw err
}
