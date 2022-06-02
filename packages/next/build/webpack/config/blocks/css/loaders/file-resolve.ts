export function cssFileResolve(url: string, _resourcePath: string) {
  if (url.startsWith('/')) {
    return false
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) {
    return false
  }
  return true
}
