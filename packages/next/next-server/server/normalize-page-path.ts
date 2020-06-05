import { posix } from 'path'

export function normalizePathSep(path: string): string {
  return path.replace(/\\/g, '/')
}

export function normalizePagePath(page: string): string {
  // Resolve on anything that doesn't start with `/`
  if (!page.startsWith('/')) {
    page = `/${page}`
  }
  // Throw when using ../ etc in the pathname
  const resolvedPage = posix.normalize(page)
  if (page !== resolvedPage) {
    throw new Error(
      `Requested and resolved page mismatch: ${page} ${resolvedPage}`
    )
  }
  return page
}
