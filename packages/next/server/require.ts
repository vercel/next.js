import { promises } from 'fs'
import { join } from 'path'
import {
  FONT_MANIFEST,
  MIDDLEWARE_MANIFEST,
  PAGES_MANIFEST,
  ROOT_PATHS_MANIFEST,
  SERVER_DIRECTORY,
} from '../shared/lib/constants'
import { normalizePagePath, denormalizePagePath } from './normalize-page-path'
import { normalizeLocalePath } from '../shared/lib/i18n/normalize-locale-path'
import type { PagesManifest } from '../build/webpack/plugins/pages-manifest-plugin'
import type { MiddlewareManifest } from '../build/webpack/plugins/middleware-plugin'
import type { WasmBinding } from '../build/webpack/loaders/next-middleware-wasm-loader'

export function pageNotFoundError(page: string): Error {
  const err: any = new Error(`Cannot find module for page: ${page}`)
  err.code = 'ENOENT'
  return err
}

export function getPagePath(
  page: string,
  distDir: string,
  locales?: string[],
  rootDirEnabled?: boolean
): string {
  const serverBuildPath = join(distDir, SERVER_DIRECTORY)
  let rootPathsManifest: undefined | PagesManifest

  if (rootDirEnabled) {
    rootPathsManifest = require(join(serverBuildPath, ROOT_PATHS_MANIFEST))
  }

  const pagesManifest = require(join(
    serverBuildPath,
    PAGES_MANIFEST
  )) as PagesManifest

  try {
    page = denormalizePagePath(normalizePagePath(page))
  } catch (err) {
    console.error(err)
    throw pageNotFoundError(page)
  }
  const checkManifest = (manifest: PagesManifest) => {
    let curPath = manifest[page]

    if (!pagesManifest[page] && locales) {
      const manifestNoLocales: PagesManifest = {}

      for (const key of Object.keys(manifest)) {
        manifestNoLocales[normalizeLocalePath(key, locales).pathname] =
          manifest[key]
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
    throw pageNotFoundError(page)
  }
  return join(serverBuildPath, pagePath)
}

export function requirePage(
  page: string,
  distDir: string,
  rootDirEnabled?: boolean
): any {
  const pagePath = getPagePath(page, distDir, undefined, rootDirEnabled)
  if (pagePath.endsWith('.html')) {
    return promises.readFile(pagePath, 'utf8')
  }
  return require(pagePath)
}

export function requireFontManifest(distDir: string) {
  const serverBuildPath = join(distDir, SERVER_DIRECTORY)
  const fontManifest = require(join(serverBuildPath, FONT_MANIFEST))
  return fontManifest
}

export function getMiddlewareInfo(params: {
  dev?: boolean
  distDir: string
  page: string
}): {
  name: string
  paths: string[]
  env: string[]
  wasm: WasmBinding[]
} {
  const serverBuildPath = join(params.distDir, SERVER_DIRECTORY)

  const middlewareManifest: MiddlewareManifest = require(join(
    serverBuildPath,
    MIDDLEWARE_MANIFEST
  ))

  let page: string

  try {
    page = denormalizePagePath(normalizePagePath(params.page))
  } catch (err) {
    throw pageNotFoundError(params.page)
  }

  let pageInfo = middlewareManifest.middleware[page]
  if (!pageInfo) {
    throw pageNotFoundError(page)
  }

  return {
    name: pageInfo.name,
    paths: pageInfo.files.map((file) => join(params.distDir, file)),
    env: pageInfo.env ?? [],
    wasm: (pageInfo.wasm ?? []).map((binding) => ({
      ...binding,
      filePath: join(params.distDir, binding.filePath),
    })),
  }
}
