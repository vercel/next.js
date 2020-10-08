export function cssFileResolve(url: string, _resourcePath: string) {
  if (url.startsWith('/')) {
    return false
  }
  return true
}
