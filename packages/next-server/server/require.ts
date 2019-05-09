import {join} from 'path'
import {PAGES_MANIFEST, SERVER_DIRECTORY, SERVERLESS_DIRECTORY} from '../lib/constants'
import { normalizePagePath } from './normalize-page-path'

export function pageNotFoundError(page: string): Error {
  const err: any = new Error(`Cannot find module for page: ${page}`)
  err.code = 'ENOENT'
  return err
}

export function getPagePath(page: string, distDir: string): string {
  let pagesManifest: any
  try {
    pagesManifest = require(join(distDir, SERVER_DIRECTORY, PAGES_MANIFEST))
  } catch (_) {
    pagesManifest = require(join(distDir, SERVERLESS_DIRECTORY, PAGES_MANIFEST))
  }

  try {
    page = normalizePagePath(page)
    page = page === '/' ? '/index' : page
  } catch (err) {
    // tslint:disable-next-line
    console.error(err)
    throw pageNotFoundError(page)
  }

  if (!pagesManifest[page]) {
    const cleanedPage = page.replace(/\/index$/, '') || '/'
    if (!pagesManifest[cleanedPage]) {
      throw pageNotFoundError(page)
    } else {
      page = cleanedPage
    }
  }
  return pagesManifest[page]
}

export function requirePage(page: string, distDir: string): any {
  const pagePath = getPagePath(page, distDir)

  try {
    return require(join(distDir, SERVER_DIRECTORY, pagePath))
  } catch (_) {
    return require(join(distDir, SERVERLESS_DIRECTORY, pagePath))
  }
}
