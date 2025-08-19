import path, { posix } from 'path'
import type { PageStaticInfo } from '../../build/analysis/get-page-static-info'
import type { MappedPages } from '../../build/build-context'
import { collectAppFiles, collectPagesFiles, createPagesMapping, getPageFilePath, getPageFromPath, getStaticInfoIncludingLayouts, runDependingOnPageType, sortByPageExts, type CreateEntrypointsParams } from '../../build/entries'
import { normalizeCatchAllRoutes } from '../../build/normalize-catchall-routes'
import { APP_DIR_ALIAS, INSTRUMENTATION_HOOK_FILENAME, MIDDLEWARE_FILENAME, PAGES_DIR_ALIAS, ROOT_DIR_ALIAS } from '../../lib/constants'
import { PAGE_TYPES } from '../../lib/page-types'
import { normalizePagePath } from '../../shared/lib/page-path/normalize-page-path'
import { normalizeAppPath } from '../../shared/lib/router/utils/app-paths'
import { createValidFileMatcher } from '../lib/find-page-file'
import HotReloaderWebpack from './hot-reloader-webpack'
import { ADDED, EntryTypes, getEntries, getEntryKey } from './on-demand-entry-handler'
import { isInstrumentationHookFile, isMiddlewareFile } from '../../build/utils'
import { getFilesInDir } from '../../lib/get-files-in-dir'
import { COMPILER_NAMES, RSC_MODULE_TYPES } from '../../shared/lib/constants'
import type { PageExtensions } from '../../build/page-extensions-type'

async function createEntries(
  params: CreateEntrypointsParams
): Promise<ReturnType<typeof getEntries>> {
  const {
    config,
    pages,
    pagesDir,
    isDev,
    rootDir,
    rootPaths,
    appDir,
    appPaths,
    pageExtensions,
  } = params
  const result: ReturnType<typeof getEntries> = {}

  let appPathsPerRoute: Record<string, string[]> = {}
  if (appDir && appPaths) {
    for (const pathname in appPaths) {
      const normalizedPath = normalizeAppPath(pathname)
      const actualPath = appPaths[pathname]
      if (!appPathsPerRoute[normalizedPath]) {
        appPathsPerRoute[normalizedPath] = []
      }
      appPathsPerRoute[normalizedPath].push(
        // TODO-APP: refactor to pass the page path from createPagesMapping instead.
        getPageFromPath(actualPath, pageExtensions).replace(APP_DIR_ALIAS, '')
      )
    }

    // TODO: find a better place to do this
    normalizeCatchAllRoutes(appPathsPerRoute)

    // Make sure to sort parallel routes to make the result deterministic.
    appPathsPerRoute = Object.fromEntries(
      Object.entries(appPathsPerRoute).map(([k, v]) => [k, v.sort()])
    )
  }

  const getEntryHandler =
    (mappings: MappedPages, pagesType: PAGE_TYPES): ((page: string) => void) =>
    async (page) => {
      const bundleFile = normalizePagePath(page)
      const serverBundlePath =
        pagesType === PAGE_TYPES.PAGES
          ? posix.join('pages', bundleFile)
          : pagesType === PAGE_TYPES.APP
            ? posix.join('app', bundleFile)
            : bundleFile.slice(1)

      const absolutePagePath = mappings[page]

      // Handle paths that have aliases
      const pageFilePath = getPageFilePath({
        absolutePagePath,
        pagesDir,
        appDir,
        rootDir,
      })

      const isInsideAppDir =
        !!appDir &&
        (absolutePagePath.startsWith(APP_DIR_ALIAS) ||
          absolutePagePath.startsWith(appDir))

      const staticInfo: PageStaticInfo = await getStaticInfoIncludingLayouts({
        isInsideAppDir,
        pageExtensions,
        pageFilePath,
        appDir,
        config,
        isDev,
        page,
      })

      // TODO(timneutkens): remove this
      const isServerComponent =
        isInsideAppDir && staticInfo.rsc !== RSC_MODULE_TYPES.client

      const isInstrumentation =
        isInstrumentationHookFile(page) && pagesType === PAGE_TYPES.ROOT

      runDependingOnPageType({
        page,
        pageRuntime: staticInfo.runtime,
        pageType: pagesType,
        onClient: () => {
          if (isServerComponent || isInsideAppDir) {
            // We skip the initial entries for server component pages and let the
            // server compiler inject them instead.
          } else {
            const entryKey = getEntryKey(COMPILER_NAMES.client, pagesType, page)
            result[entryKey] = {
              type: EntryTypes.ENTRY,
              appPaths: null,
              absolutePagePath,
              request: absolutePagePath,
              bundlePath: serverBundlePath,
              dispose: false,
              lastActiveTime: Date.now(),
              status: ADDED,
            }
          }
        },
        onServer: () => {
          const entryKey = getEntryKey(COMPILER_NAMES.server, pagesType, page)
          if (isInstrumentation || isMiddlewareFile(page)) {
            result[entryKey] = {
              type: EntryTypes.ENTRY,
              appPaths: null,
              absolutePagePath,
              request: absolutePagePath,
              bundlePath: serverBundlePath.replace('src/', ''),
              dispose: false,
              lastActiveTime: Date.now(),
              status: ADDED,
            }
          } else {
            result[entryKey] = {
              type: EntryTypes.ENTRY,
              appPaths: null,
              absolutePagePath,
              request: absolutePagePath,
              bundlePath: serverBundlePath,
              dispose: false,
              lastActiveTime: Date.now(),
              status: ADDED,
            }
          }
        },
        onEdgeServer: () => {
          const entryKey = getEntryKey(COMPILER_NAMES.server, pagesType, page)
          if (isInstrumentation) {
            result[entryKey] = {
              type: EntryTypes.ENTRY,
              appPaths: null,
              absolutePagePath,
              request: absolutePagePath,
              bundlePath: serverBundlePath.replace('src/', ''),
              dispose: false,
              lastActiveTime: Date.now(),
              status: ADDED,
            }
          } else {
            result[entryKey] = {
              type: EntryTypes.ENTRY,
              appPaths: null,
              absolutePagePath,
              request: absolutePagePath,
              bundlePath: serverBundlePath,
              dispose: false,
              lastActiveTime: Date.now(),
              status: ADDED,
            }
          }
        },
      })
    }

  const promises: Promise<void[]>[] = []

  if (appPaths) {
    const entryHandler = getEntryHandler(appPaths, PAGE_TYPES.APP)
    promises.push(Promise.all(Object.keys(appPaths).map(entryHandler)))
  }
  if (rootPaths) {
    promises.push(
      Promise.all(
        Object.keys(rootPaths).map(getEntryHandler(rootPaths, PAGE_TYPES.ROOT))
      )
    )
  }
  promises.push(
    Promise.all(
      Object.keys(pages).map(getEntryHandler(pages, PAGE_TYPES.PAGES))
    )
  )

  await Promise.all(promises)

  return result
}

async function createPagesAbsolutePathMapping({
  isDev,
  pageExtensions,
  pagePaths,
  pagesType,
  pagesDir,
  appDir,
  rootDir,
}: {
  isDev: boolean
  pageExtensions: PageExtensions
  pagePaths: string[]
  pagesType: PAGE_TYPES
  pagesDir: string | undefined
  appDir: string | undefined
  rootDir: string | undefined
}) {
  const mappedPages = await createPagesMapping({
    isDev,
    pageExtensions,
    pagesType,
    pagePaths,
    pagesDir,
    appDir,
  })
  for (const route in mappedPages) {
    mappedPages[route] = mappedPages[route].replace(PAGES_DIR_ALIAS, pagesDir || '');
    mappedPages[route] = mappedPages[route].replace(APP_DIR_ALIAS, appDir || '');
    mappedPages[route] = mappedPages[route].replace(ROOT_DIR_ALIAS, rootDir || '');
  }
  return mappedPages;
}

export default class HotReloaderRspack extends HotReloaderWebpack {
  public async start(): Promise<void> {
    const rspackStartSpan = this.hotReloaderSpan.traceChild('rspack-start')

    const outputPath = path.join(this.dir, this.config.distDir);
    const curEntries = getEntries(outputPath)

    const pageExtensions = this.config.pageExtensions

    const validFileMatcher = createValidFileMatcher(pageExtensions, this.appDir)

    const pagesPaths = this.pagesDir
      ? await rspackStartSpan
          .traceChild('collect-pages')
          .traceAsyncFn(() => collectPagesFiles(this.pagesDir!, validFileMatcher))
      : []

    const middlewareDetectionRegExp = new RegExp(
      `^${MIDDLEWARE_FILENAME}\\.(?:${pageExtensions.join('|')})$`
    )

    const instrumentationHookDetectionRegExp = new RegExp(
      `^${INSTRUMENTATION_HOOK_FILENAME}\\.(?:${pageExtensions.join(
        '|'
      )})$`
    )

    const rootDir = path.join((this.pagesDir || this.appDir)!, '..')
    const includes = [
      middlewareDetectionRegExp,
      instrumentationHookDetectionRegExp,
    ]

    const rootPaths = Array.from(await getFilesInDir(rootDir))
      .filter((file) => includes.some((include) => include.test(file)))
      .sort(sortByPageExts(pageExtensions))
      .map((file) => path.join(rootDir, file).replace(this.dir, ''))
    
    const hasInstrumentationHook = rootPaths.some((p) =>
      p.includes(INSTRUMENTATION_HOOK_FILENAME)
    )

    const mappedPages = await rspackStartSpan
      .traceChild('create-pages-mapping')
      .traceAsyncFn(() =>
        createPagesAbsolutePathMapping({
          isDev: true,
          pageExtensions,
          pagesType: PAGE_TYPES.PAGES,
          pagePaths: pagesPaths,
          pagesDir: this.pagesDir,
          appDir: this.appDir,
          rootDir: this.dir,
        })
      )

    let mappedAppPages: MappedPages | undefined

    if (this.appDir) {
      const providedAppPaths: string[] = JSON.parse(
        process.env.NEXT_PRIVATE_APP_PATHS || '[]'
      )

      let appPaths: string[]

      if (Boolean(process.env.NEXT_PRIVATE_APP_PATHS)) {
        // used for testing?
        appPaths = providedAppPaths
      } else {
        // Collect app pages, layouts, and default files in a single directory traversal
        const result = await rspackStartSpan
          .traceChild('collect-app-files')
          .traceAsyncFn(() => collectAppFiles(this.appDir!, validFileMatcher))

        appPaths = result.appPaths
      }

      mappedAppPages = await rspackStartSpan
        .traceChild('create-app-mapping')
        .traceAsyncFn(() =>
          createPagesAbsolutePathMapping({
            pagePaths: appPaths,
            isDev: true,
            pagesType: PAGE_TYPES.APP,
            pageExtensions,
            pagesDir: this.pagesDir,
            appDir: this.appDir,
            rootDir: this.dir,
          })
        )
    }

    const mappedRootPaths = await createPagesAbsolutePathMapping({
      isDev: true,
      pageExtensions,
      pagePaths: rootPaths,
      pagesType: PAGE_TYPES.ROOT,
      pagesDir: this.pagesDir,
      appDir: this.appDir,
      rootDir: this.dir,
    })

    Object.assign(
      curEntries,
      await rspackStartSpan
        .traceChild('create-entries')
        .traceAsyncFn(() =>
          createEntries({
            appDir: this.appDir,
            buildId: this.buildId,
            config: this.config,
            envFiles: [],
            isDev: true,
            pages: mappedPages,
            pagesDir: this.pagesDir,
            previewMode: this.previewProps,
            rootDir: this.dir,
            pageExtensions: this.config.pageExtensions,
            appPaths: mappedAppPages,
            rootPaths: mappedRootPaths,
            hasInstrumentationHook
          })
      )
    );

    super.start()
  }
}
