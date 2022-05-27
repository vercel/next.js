import type { NextPathnameInfo } from './get-next-pathname-info'
import { addPathPrefix } from './add-path-prefix'
import { addPathSuffix } from './add-path-suffix'
import { addLocale } from './add-locale'

export function formatNextPathnameInfo(info: NextPathnameInfo) {
  let pathname = addLocale(info.pathname, info.locale)

  if (info.buildId) {
    pathname = addPathSuffix(
      addPathPrefix(pathname, `/_next/data/${info.buildId}`),
      info.pathname === '/' ? 'index.json' : '.json'
    )
  }

  pathname = addPathPrefix(pathname, info.basePath)
  return info.trailingSlash && !info.buildId && !pathname.endsWith('/')
    ? addPathSuffix(pathname, '/')
    : pathname
}
