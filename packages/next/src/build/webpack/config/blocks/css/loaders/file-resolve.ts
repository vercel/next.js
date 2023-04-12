export function cssFileResolve(
  url: string,
  _resourcePath: string,
  urlImports: any
) {
  if (url.startsWith('/')) {
    return false
  }
  if (!urlImports && /^[a-z][a-z0-9+.-]*:/i.test(url)) {
    return false
  }
  if (urlImports && url.startsWith('data:')) {
    return false
  }
  return true
}
