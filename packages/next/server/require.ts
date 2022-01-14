import { createContext, runInNewContext } from 'vm'
import { promises } from 'fs'
import { join } from 'path'
import {
  FONT_MANIFEST,
  MIDDLEWARE_MANIFEST,
  PAGES_MANIFEST,
  SERVER_DIRECTORY,
  SERVERLESS_DIRECTORY,
} from '../shared/lib/constants'

import { normalizePagePath, denormalizePagePath } from './normalize-page-path'
import { normalizeLocalePath } from '../shared/lib/i18n/normalize-locale-path'
import type { PagesManifest } from '../build/webpack/plugins/pages-manifest-plugin'
import type { MiddlewareManifest } from '../build/webpack/plugins/middleware-plugin'

const __FREEZE_GLOBALS__ = () => {
  const GLOBAL = globalThis as any

  Object.freeze(GLOBAL)
  Object.freeze(GLOBAL.Buffer)
  Object.freeze(GLOBAL.process)
  Object.freeze(GLOBAL.console)
  Object.freeze(GLOBAL.setTimeout)
  Object.freeze(GLOBAL.setInterval)
  Object.freeze(GLOBAL.clearInterval)
  Object.freeze(GLOBAL.clearTimeout)
  Object.freeze(GLOBAL.setImmediate)
  Object.freeze(GLOBAL.clearImmediate)
  Object.freeze(GLOBAL.__dirname)
  Object.freeze(GLOBAL.__filename)
  Object.freeze(GLOBAL.global)
  Object.freeze(GLOBAL.require)
  Object.freeze(GLOBAL.exports)
  Object.freeze(GLOBAL.module)
  Object.freeze(GLOBAL.Buffer)
  Object.freeze(GLOBAL.console)
  Object.freeze(GLOBAL.process)
  Object.freeze(GLOBAL.setTimeout)
  Object.freeze(GLOBAL.setInterval)
  Object.freeze(GLOBAL.clearInterval)
  Object.freeze(GLOBAL.clearTimeout)
  Object.freeze(GLOBAL.setImmediate)
  Object.freeze(GLOBAL.clearImmediate)
  Object.freeze(GLOBAL.__dirname)
  Object.freeze(GLOBAL.__filename)
  Object.freeze(GLOBAL.global)
  Object.freeze(GLOBAL.require)
  Object.freeze(GLOBAL.exports)
  Object.freeze(GLOBAL.module)
  Object.freeze(GLOBAL.Buffer)
  Object.freeze(GLOBAL.console)
  Object.freeze(GLOBAL.process)
  Object.freeze(GLOBAL.setTimeout)
  Object.freeze(GLOBAL.setInterval)
  Object.freeze(GLOBAL.clearInterval)
  Object.freeze(GLOBAL.clearTimeout)
  Object.freeze(GLOBAL.setImmediate)
  Object.freeze(GLOBAL.clearImmediate)
  Object.freeze(GLOBAL.__dirname)
  Object.freeze(GLOBAL.__filename)

  Object.freeze(Object.getPrototypeOf([]))
  Object.freeze(Object.getPrototypeOf({}))
  Object.freeze(Object.getPrototypeOf(() => void 0))
  Object.freeze(Object.getPrototypeOf(async () => void 0))
}

/**
 * `require(...)` a module within an isolated VM context, which prevents the
 * module from sharing the same context as Next and potentially contaminating
 * Next's own logic (i.e., by shimming globals).
 *
 * This should be used to load all React components for SSR.
 * @see requirePage
 *
 * @param specifier The module to load.
 * @returns The loaded module.
 */
export function isolatedRequire(specifier: string) {
  /**
   * This sandbox will get a cloned, frozen version of the global object. This
   * means that globalThis will be appropriately scoped to the component and
   * changes cannot be propagated upward to the Next Server itself.
   */
  const sandbox = createContext({
    globalThis: Object.assign({}, globalThis),
    require: Object.assign({}, require),
    __FREEZE_GLOBALS__,
  })
  /**
   * Lock down the component context and then load the Page Component module.
   */
  const sesRequire = `;__FREEZE_GLOBALS__(); require(${JSON.stringify(
    specifier
  )});`
  /**
   * Return the loaded module.
   */
  return runInNewContext(sesRequire, sandbox)
}

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
  locales?: string[]
): string {
  const serverBuildPath = join(
    distDir,
    serverless && !dev ? SERVERLESS_DIRECTORY : SERVER_DIRECTORY
  )
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
  let pagePath = pagesManifest[page]

  if (!pagesManifest[page] && locales) {
    const manifestNoLocales: typeof pagesManifest = {}

    for (const key of Object.keys(pagesManifest)) {
      manifestNoLocales[normalizeLocalePath(key, locales).pathname] =
        pagesManifest[key]
    }
    pagePath = manifestNoLocales[page]
  }

  if (!pagePath) {
    throw pageNotFoundError(page)
  }

  return join(serverBuildPath, pagePath)
}

export function requirePage(
  page: string,
  distDir: string,
  serverless: boolean
): any {
  const pagePath = getPagePath(page, distDir, serverless)
  if (pagePath.endsWith('.html')) {
    return promises.readFile(pagePath, 'utf8')
  }
  /**
   * Use isolated require() to avoid cross-module contamination with Next's own
   * logic.
   */
  return isolatedRequire(pagePath)
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
}): { name: string; paths: string[]; env: string[] } {
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
  }
}
