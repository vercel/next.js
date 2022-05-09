import { promises } from 'fs'
import { join } from 'path'
import {
  FONT_MANIFEST,
  MIDDLEWARE_MANIFEST,
  PAGES_MANIFEST,
  SERVER_DIRECTORY,
  SERVERLESS_DIRECTORY,
  VIEW_PATHS_MANIFEST,
} from '../shared/lib/constants'
import { normalizeLocalePath } from '../shared/lib/i18n/normalize-locale-path'
import { normalizePagePath } from '../shared/lib/page-path/normalize-page-path'
import { denormalizePagePath } from '../shared/lib/page-path/denormalize-page-path'
import type { PagesManifest } from '../build/webpack/plugins/pages-manifest-plugin'
import type { MiddlewareManifest } from '../build/webpack/plugins/middleware-plugin'
import type { WasmBinding } from '../build/webpack/loaders/get-module-build-info'

export function pageNotFoundError(page: string): Error {
  const err: any = new Error(`Cannot find module for page: ${page}`)
  err.code = 'ENOENT'
  return err
}

export function getPagePath(
  page: string,
  distDir: string,
  serverless: boolean,
  dev?: boolean,
  locales?: string[],
  rootEnabled?: boolean
): string {
  const serverBuildPath = join(
    distDir,
    serverless && !dev ? SERVERLESS_DIRECTORY : SERVER_DIRECTORY
  )
  let rootPathsManifest: undefined | PagesManifest

  if (rootEnabled) {
    if (page === '/_root') {
      return join(serverBuildPath, 'root.js')
    }
    rootPathsManifest = require(join(serverBuildPath, VIEW_PATHS_MANIFEST))
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
    throw pageNotFoundError(page)
  }
  return join(serverBuildPath, pagePath)
}

export function requirePage(
  page: string,
  distDir: string,
  serverless: boolean,
  rootEnabled?: boolean
): any {
  const pagePath = getPagePath(
    page,
    distDir,
    serverless,
    false,
    undefined,
    rootEnabled
  )
  if (pagePath.endsWith('.html')) {
    return promises.readFile(pagePath, 'utf8')
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

export function getMiddlewareInfo(params: {
  dev?: boolean
  distDir: string
  page: string
  serverless: boolean
}): {
  name: string
  paths: string[]
  env: string[]
  wasm: WasmBinding[]
} {
  const serverBuildPath = join(
    params.distDir,
    params.serverless && !params.dev ? SERVERLESS_DIRECTORY : SERVER_DIRECTORY
  )

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
