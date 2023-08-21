const DUMMY_ORIGIN = 'http://n'
const INVALID_URL_MESSAGE = 'Invalid request URL'

export function validateURL(url: string | undefined): string {
  if (!url) {
    throw new Error(INVALID_URL_MESSAGE)
  }
  try {
    const parsed = new URL(url, DUMMY_ORIGIN)
    // Avoid origin change by extra slashes in pathname
    if (parsed.origin !== DUMMY_ORIGIN) {
      throw new Error(INVALID_URL_MESSAGE)
    }
    return url
  } catch {
    throw new Error(INVALID_URL_MESSAGE)
  }
}
