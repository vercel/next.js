const DUMMY_ORIGIN = 'http://n'
const INVALID_URL_MESSAGE = 'Invalid request URL'

// URL.canParse is supported on Node 19 and 20.
// Node 18 backport is pending.
// Reference: https://github.com/nodejs/node/pull/48345
const supportsCanParse = URL.hasOwnProperty('canParse')

export function validateURL(url: string | undefined): string {
  if (url == null) {
    throw new Error(INVALID_URL_MESSAGE)
  }

  if (supportsCanParse) {
    // @ts-ignore
    if (!URL.canParse(url, DUMMY_ORIGIN)) {
      throw new Error(INVALID_URL_MESSAGE)
    }

    return url
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
