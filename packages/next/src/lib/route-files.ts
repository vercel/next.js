import type { PageExtensions } from '../build/page-extensions-type'
import type { createValidFileMatcher } from '../server/lib/find-page-file'
import { normalizePathSep } from '../shared/lib/page-path/normalize-path-sep'
import { isAPIRoute } from './is-api-route'
import { recursiveReadDir } from './recursive-readdir'

const PAGES_FRAMEWORK_ROUTES = new Set(['/_app', '/_document', '/_error'])

export function isRenderablePagesRoute(page: string): boolean {
  return !PAGES_FRAMEWORK_ROUTES.has(page) && !isAPIRoute(page)
}

function removeSuffix(value: string, suffix: string): string {
  return value.endsWith(suffix) ? value.slice(0, -suffix.length) : value
}

/**
 * For a given page path removes the provided extensions.
 */
export function getPageFromPath(
  pagePath: string,
  pageExtensions: PageExtensions
) {
  let page = normalizePathSep(pagePath)
  // Try longer extensions first so compound extensions like 'page.js'
  // match before shorter ones like 'js'
  const sorted = [...pageExtensions].sort((a, b) => b.length - a.length)
  for (const extension of sorted) {
    const next = removeSuffix(page, `.${extension}`)
    if (next !== page) {
      page = next
      break
    }
  }

  page = removeSuffix(page, '/index')

  return page === '' ? '/' : page
}

/**
 * Collect app pages, layouts, and default files from the app directory
 */
export async function collectAppFiles(
  appDir: string,
  validFileMatcher: ReturnType<typeof createValidFileMatcher>
): Promise<{
  appPaths: string[]
  layoutPaths: string[]
  defaultPaths: string[]
}> {
  const allAppFiles = await recursiveReadDir(appDir, {
    pathnameFilter: (absolutePath) =>
      validFileMatcher.isAppRouterPage(absolutePath) ||
      validFileMatcher.isRootNotFound(absolutePath) ||
      validFileMatcher.isAppLayoutPage(absolutePath) ||
      validFileMatcher.isAppDefaultPage(absolutePath),
    ignorePartFilter: (part) => part.startsWith('_'),
  })

  const appPaths = allAppFiles.filter(
    (absolutePath) =>
      validFileMatcher.isAppRouterPage(absolutePath) ||
      validFileMatcher.isRootNotFound(absolutePath)
  )
  const layoutPaths = allAppFiles.filter((absolutePath) =>
    validFileMatcher.isAppLayoutPage(absolutePath)
  )
  const defaultPaths = allAppFiles.filter((absolutePath) =>
    validFileMatcher.isAppDefaultPage(absolutePath)
  )

  return { appPaths, layoutPaths, defaultPaths }
}

/**
 * Collect pages from the pages directory
 */
export async function collectPagesFiles(
  pagesDir: string,
  validFileMatcher: ReturnType<typeof createValidFileMatcher>
): Promise<string[]> {
  return await recursiveReadDir(pagesDir, {
    pathnameFilter: validFileMatcher.isPageFile,
  })
}
