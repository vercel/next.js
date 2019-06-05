import fs from 'fs'
import { join } from 'path'
import { promisify } from 'util'
import {
  PAGES_MANIFEST,
  SERVER_DIRECTORY,
  SERVERLESS_DIRECTORY,
} from '../lib/constants'
import { normalizePagePath } from './normalize-page-path'

const readFile = promisify(fs.readFile)

export function pageNotFoundError(page: string): Error {
  const err: any = new Error(`Cannot find module for page: ${page}`)
  err.code = 'ENOENT'
  return err
}

export function getPagePath(
  page: string,
  distDir: string,
  serverless: boolean
): string {
  const serverBuildPath = join(
    distDir,
    serverless ? SERVERLESS_DIRECTORY : SERVER_DIRECTORY
  )
  const pagesManifest = require(join(serverBuildPath, PAGES_MANIFEST))

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
  return join(serverBuildPath, pagesManifest[page])
}

export function requirePage(
  page: string,
  distDir: string,
  serverless: boolean
): any {
  const pagePath = getPagePath(page, distDir, serverless)
  if (pagePath.endsWith('.html')) {
    return readFile(pagePath, 'utf8')
  }
  return require(pagePath)
}
