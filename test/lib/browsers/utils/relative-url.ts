export function isValidRelativeUrl(url: string) {
  if (url.startsWith('/')) {
    return true
  }
  try {
    new URL(url)
    // absolute urls will pass
    return false
  } catch (err) {
    // see if constructing a URL relative to a fake origin succeeds
    let resolved: URL
    const fakeOrigin = 'http://fake-origin'
    try {
      resolved = new URL(url, fakeOrigin)
      return resolved.origin === fakeOrigin
    } catch {
      // failed even with a fake origin, likely malformed url
      return false
    }
  }
}
