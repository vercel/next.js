import {join, posix} from 'path'
import {PAGES_MANIFEST, SERVER_DIRECTORY} from 'next-server/constants'

export function pageNotFoundError (page: string): Error {
  const err: any = new Error(`Cannot find module for page: ${page}`)
  err.code = 'ENOENT'
  return err
}

export function normalizePagePath (page: string): string {
  // If the page is `/` we need to append `/index`, otherwise the returned directory root will be bundles instead of pages
  if (page === '/') {
    page = '/index'
  }

  // Resolve on anything that doesn't start with `/`
  if (page[0] !== '/') {
    page = `/${page}`
  }

  // Throw when using ../ etc in the pathname
  const resolvedPage = posix.normalize(page)
  if (page !== resolvedPage) {
    throw new Error('Requested and resolved page mismatch')
  }

  return page
}

export function getPagePath (page: string, distDir: string): string {
  const serverBuildPath = join(distDir, SERVER_DIRECTORY)
  const pagesManifest = require(join(serverBuildPath, PAGES_MANIFEST))

  try {
    page = normalizePagePath(page)
  } catch (err) {
    console.error(err)
    throw pageNotFoundError(page)
  }

  if (!pagesManifest[page]) {
    throw pageNotFoundError(page)
  }

  return join(serverBuildPath, pagesManifest[page])
}

export async function requirePage (page: string, distDir: string): Promise<any> {
  const pagePath = getPagePath(page, distDir)
  return require(pagePath)
}
