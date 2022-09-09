import { promises } from 'fs'
import { join } from 'path'
import {
  FONT_MANIFEST,
  PAGES_MANIFEST,
  SERVER_DIRECTORY,
  SERVERLESS_DIRECTORY,
  APP_PATHS_MANIFEST,
} from '../shared/lib/constants'
import { normalizeLocalePath } from '../shared/lib/i18n/normalize-locale-path'
import { normalizePagePath } from '../shared/lib/page-path/normalize-page-path'
import { denormalizePagePath } from '../shared/lib/page-path/denormalize-page-path'
import type { PagesManifest } from '../build/webpack/plugins/pages-manifest-plugin'
import { PageNotFoundError, MissingStaticPage } from '../shared/lib/utils'

export function getPagePath(
  page: string,
  distDir: string,
  serverless: boolean,
  dev?: boolean,
  locales?: string[],
  appDirEnabled?: boolean
): string {
  const serverBuildPath = join(
    distDir,
    serverless && !dev ? SERVERLESS_DIRECTORY : SERVER_DIRECTORY
  )
  let rootPathsManifest: undefined | PagesManifest

  if (appDirEnabled) {
    rootPathsManifest = require(join(serverBuildPath, APP_PATHS_MANIFEST))
  }
  const pagesManifest = require(join(
    serverBuildPath,
    PAGES_MANIFEST
  )) as PagesManifest

  try {
    page = denormalizePagePath(normalizePagePath(page))
  } catch (err) {
    console.error(err)
    throw new PageNotFoundError(page)
  }

  const checkManifest = (manifest: PagesManifest) => {
    let curPath = manifest[page]

    if (!manifest[curPath] && locales) {
      const manifestNoLocales: typeof pagesManifest = {}

      for (const key of Object.keys(manifest)) {
        manifestNoLocales[normalizeLocalePath(key, locales).pathname] =
          pagesManifest[key]
      }
      curPath = manifestNoLocales[page]
    }
    return curPath
  }
  let pagePath: string | undefined

  if (rootPathsManifest) {
    pagePath = checkManifest(rootPathsManifest)
  }

  if (!pagePath) {
    pagePath = checkManifest(pagesManifest)
  }

  if (!pagePath) {
    throw new PageNotFoundError(page)
  }
  return join(serverBuildPath, pagePath)
}

export function requirePage(
  page: string,
  distDir: string,
  serverless: boolean,
  appDirEnabled?: boolean
): any {
  const pagePath = getPagePath(
    page,
    distDir,
    serverless,
    false,
    undefined,
    appDirEnabled
  )
  if (pagePath.endsWith('.html')) {
    return promises.readFile(pagePath, 'utf8').catch((err) => {
      throw new MissingStaticPage(page, err.message)
    })
  }
  return require(pagePath)
}

export function requireFontManifest(distDir: string, serverless: boolean) {
  const serverBuildPath = join(
    distDir,
    serverless ? SERVERLESS_DIRECTORY : SERVER_DIRECTORY
  )
  const fontManifest = require(join(serverBuildPath, FONT_MANIFEST))
  return fontManifest
}
