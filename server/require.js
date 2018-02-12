import {join, parse, resolve} from 'path'

export function pageNotFoundError (page) {
  const err = new Error(`Cannot find module for page: ${page}`)
  err.code = 'ENOENT'
  return err
}

export function getPagePath (page, {dir, dist}) {
  const pageBundlesPath = join(dir, dist, 'dist', 'bundles', 'pages')

  // If the page is `/` we need to append `/index`, otherwise the returned directory root will be bundles instead of pages
  if (page === '/') {
    page = '/index'
  }

  // Resolve on anything that doesn't start with `/`
  if (page[0] !== '/') {
    page = `/${page}`
  }

  // Throw when using ../ etc in the pathname
  const resolvedPage = resolve(page)
  if (page !== resolvedPage) {
    throw pageNotFoundError(resolvedPage)
  }

  const pagePath = join(pageBundlesPath, resolvedPage) // Path to the page that is to be loaded

  // Don't allow wandering outside of the bundles directory
  const pathDir = parse(pagePath).dir
  if (pathDir.indexOf(pageBundlesPath) !== 0) {
    throw pageNotFoundError(resolvedPage)
  }

  return pagePath
}

export default async function requirePage (page, {dir, dist}) {
  const pagePath = getPagePath(page, {dir, dist})
  try {
    return require(pagePath)
  } catch (err) {
    throw pageNotFoundError(page)
  }
}
