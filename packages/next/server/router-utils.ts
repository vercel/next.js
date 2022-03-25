export function replaceBasePath(pathname: string, basePath: string): string {
  // ensure basePath is only stripped if it matches exactly
  // and doesn't contain extra chars e.g. basePath /docs
  // should replace for /docs, /docs/, /docs/a but not /docsss
  if (hasBasePath(pathname, basePath)) {
    pathname = pathname.slice(basePath.length)
    if (!pathname.startsWith('/')) pathname = `/${pathname}`
  }
  return pathname
}

export function hasBasePath(pathname: string, basePath: string): boolean {
  return (
    typeof pathname === 'string' &&
    (pathname === basePath || pathname.startsWith(basePath + '/'))
  )
}
