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
const webpack5Experiential = parseInt(require('webpack').version) === 5

export function pageNotFoundError(page: string): Error {
  const err: any = new Error(`Cannot find module for page: ${page}`)
  err.code = 'ENOENT'
  return err
}
// hack for webpack 5 dev
// function require(module) {
//   delete require.cache[require.resolve(module)]
//   return require(module)
// }
export function getPagePath(
  page: string,
  distDir: string,
  serverless: boolean,
  dev?: boolean
): string {
  const serverBuildPath = join(
    distDir,
    serverless && !dev ? SERVERLESS_DIRECTORY : SERVER_DIRECTORY
  )
  const pagesManifest = webpack5Experiential
    ? require(join(serverBuildPath, PAGES_MANIFEST))
    : require(join(serverBuildPath, PAGES_MANIFEST))

  try {
    page = normalizePagePath(page)
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
  return webpack5Experiential ? require(pagePath) : require(pagePath)
}
