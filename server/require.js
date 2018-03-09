import {join, parse, normalize, sep} from 'path'
import fs from 'mz/fs'

export function pageNotFoundError (page) {
  const err = new Error(`Cannot find module for page: ${page}`)
  err.code = 'ENOENT'
  return err
}

export function normalizePagePath (page) {
  // If the page is `/` we need to append `/index`, otherwise the returned directory root will be bundles instead of pages
  if (page === '/') {
    page = '/index'
  }

  // Resolve on anything that doesn't start with `/`
  if (page[0] !== '/') {
    page = `/${page}`
  }

  // Windows compatibility
  if (sep !== '/') {
    page = page.replace(/\//g, sep)
  }

  // Throw when using ../ etc in the pathname
  const resolvedPage = normalize(page)
  if (page !== resolvedPage) {
    throw new Error('Requested and resolved page mismatch')
  }

  return page
}

export function getPagePath (page, {dir, dist}) {
  const pageBundlesPath = join(dir, dist, 'dist', 'bundles', 'pages')

  try {
    page = normalizePagePath(page)
  } catch (err) {
    console.error(err)
    throw pageNotFoundError(page)
  }

  const pagePath = join(pageBundlesPath, page) // Path to the page that is to be loaded

  // Don't allow wandering outside of the bundles directory
  const pathDir = parse(pagePath).dir
  if (pathDir.indexOf(pageBundlesPath) !== 0) {
    console.error('Resolved page path goes outside of bundles path')
    throw pageNotFoundError(page)
  }

  return pagePath
}

export default async function requirePage (page, {dir, dist}) {
  const pagePath = getPagePath(page, {dir, dist}) + '.js'
  const fileExists = await fs.exists(pagePath)
  if (!fileExists) {
    throw pageNotFoundError(page)
  }

  return require(pagePath)
}
