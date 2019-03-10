import {join} from 'path'
import {PAGES_MANIFEST, SERVER_DIRECTORY} from 'next-server/constants'
import { normalizePagePath } from './normalize-page-path'

export function pageNotFoundError(page: string): Error {
  const err: any = new Error(`Cannot find module for page: ${page}`)
  err.code = 'ENOENT'
  return err
}

export function getPagePath(page: string, distDir: string): string {
  const serverBuildPath = join(distDir, SERVER_DIRECTORY)
  const pagesManifest = require(join(serverBuildPath, PAGES_MANIFEST))

  try {
    page = normalizePagePath(page)
  } catch (err) {
    // tslint:disable-next-line
    console.error(err)
    throw pageNotFoundError(page)
  }

  const buildPath = pagesManifest[page] || pagesManifest[page.replace(/\/index$/, '')]

  if (!buildPath) {
    throw pageNotFoundError(page)
  }

  return join(serverBuildPath, buildPath)
}

export function requirePage(page: string, distDir: string): any {
  const pagePath = getPagePath(page, distDir)
  return require(pagePath)
}
