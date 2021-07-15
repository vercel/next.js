import { loadEnvConfig } from '@next/env'
import chalk from 'chalk'
import crypto from 'crypto'
import { promises, writeFileSync } from 'fs'
import { Worker } from '../lib/worker'
import devalue from 'next/dist/compiled/devalue'
import escapeStringRegexp from 'next/dist/compiled/escape-string-regexp'
import findUp from 'next/dist/compiled/find-up'
import { nanoid } from 'next/dist/compiled/nanoid/index.cjs'
import { pathToRegexp } from 'next/dist/compiled/path-to-regexp'
import path from 'path'
import formatWebpackMessages from '../client/dev/error-overlay/format-webpack-messages'
import {
  STATIC_STATUS_PAGE_GET_INITIAL_PROPS_ERROR,
  PUBLIC_DIR_MIDDLEWARE_CONFLICT,
} from '../lib/constants'
import { fileExists } from '../lib/file-exists'
import { findPagesDir } from '../lib/find-pages-dir'
import loadCustomRoutes, {
  CustomRoutes,
  getRedirectStatus,
  modifyRouteRegex,
  normalizeRouteRegex,
  Redirect,
  Rewrite,
  RouteType,
} from '../lib/load-custom-routes'
import { nonNullable } from '../lib/non-nullable'
import { recursiveDelete } from '../lib/recursive-delete'
import { verifyAndLint } from '../lib/verifyAndLint'
import { verifyTypeScriptSetup } from '../lib/verifyTypeScriptSetup'
import {
  BUILD_ID_FILE,
  BUILD_MANIFEST,
  CLIENT_STATIC_FILES_PATH,
  EXPORT_DETAIL,
  EXPORT_MARKER,
  FONT_MANIFEST,
  IMAGES_MANIFEST,
  PAGES_MANIFEST,
  PHASE_PRODUCTION_BUILD,
  PRERENDER_MANIFEST,
  REACT_LOADABLE_MANIFEST,
  ROUTES_MANIFEST,
  SERVERLESS_DIRECTORY,
  SERVER_DIRECTORY,
  SERVER_FILES_MANIFEST,
  STATIC_STATUS_PAGES,
} from '../shared/lib/constants'
import {
  getRouteRegex,
  getSortedRoutes,
  isDynamicRoute,
} from '../shared/lib/router/utils'
import { __ApiPreviewProps } from '../server/api-utils'
import loadConfig, { isTargetLikeServerless } from '../server/config'
import { BuildManifest } from '../server/get-page-files'
import '../server/node-polyfill-fetch'
import { normalizePagePath } from '../server/normalize-page-path'
import { getPagePath } from '../server/require'
import * as ciEnvironment from '../telemetry/ci-info'
import {
  eventBuildCompleted,
  eventBuildOptimize,
  eventCliSession,
  eventNextPlugins,
  eventTypeCheckCompleted,
} from '../telemetry/events'
import { Telemetry } from '../telemetry/storage'
import { CompilerResult, runCompiler } from './compiler'
import { createEntrypoints, createPagesMapping } from './entries'
import { generateBuildId } from './generate-build-id'
import { isWriteable } from './is-writeable'
import * as Log from './output/log'
import createSpinner from './spinner'
import { trace, setGlobal } from '../telemetry/trace'
import {
  collectPages,
  detectConflictingPaths,
  computeFromManifest,
  getJsPageSizeInKb,
  PageInfo,
  printCustomRoutes,
  printTreeView,
  getCssFilePaths,
} from './utils'
import getBaseWebpackConfig from './webpack-config'
import { PagesManifest } from './webpack/plugins/pages-manifest-plugin'
import { writeBuildId } from './write-build-id'
import { normalizeLocalePath } from '../shared/lib/i18n/normalize-locale-path'
import { isWebpack5 } from 'next/dist/compiled/webpack/webpack'
import { NextConfigComplete } from '../server/config-shared'

const staticCheckWorker = require.resolve('./utils')

export type SsgRoute = {
  initialRevalidateSeconds: number | false
  srcRoute: string | null
  dataRoute: string
}

export type DynamicSsgRoute = {
  routeRegex: string
  fallback: string | null | false
  dataRoute: string
  dataRouteRegex: string
}

export type PrerenderManifest = {
  version: 3
  routes: { [route: string]: SsgRoute }
  dynamicRoutes: { [route: string]: DynamicSsgRoute }
  notFoundRoutes: string[]
  preview: __ApiPreviewProps
}

export default async function build(
  dir: string,
  conf = null,
  reactProductionProfiling = false,
  debugOutput = false,
  runLint = true
): Promise<void> {
  const nextBuildSpan = trace('next-build')

  return nextBuildSpan.traceAsyncFn(async () => {
    // attempt to load global env values so they are available in next.config.js
    const { loadedEnvFiles } = nextBuildSpan
      .traceChild('load-dotenv')
      .traceFn(() => loadEnvConfig(dir, false, Log))

    const config: NextConfigComplete = await nextBuildSpan
      .traceChild('load-next-config')
      .traceAsyncFn(() => loadConfig(PHASE_PRODUCTION_BUILD, dir, conf))
    const { target } = config
    const buildId: string = await nextBuildSpan
      .traceChild('generate-buildid')
      .traceAsyncFn(() => generateBuildId(config.generateBuildId, nanoid))
    const distDir = path.join(dir, config.distDir)

    const customRoutes: CustomRoutes = await nextBuildSpan
      .traceChild('load-custom-routes')
      .traceAsyncFn(() => loadCustomRoutes(config))

    const { headers, rewrites, redirects } = customRoutes

    const cacheDir = path.join(distDir, 'cache')
    if (ciEnvironment.isCI && !ciEnvironment.hasNextSupport) {
      const hasCache = await fileExists(cacheDir)

      if (!hasCache) {
        // Intentionally not piping to stderr in case people fail in CI when
        // stderr is detected.
        console.log(
          `${Log.prefixes.warn} No build cache found. Please configure build caching for faster rebuilds. Read more: https://nextjs.org/docs/messages/no-cache`
        )
      }
    }

    const telemetry = new Telemetry({ distDir })
    setGlobal('telemetry', telemetry)

    const publicDir = path.join(dir, 'public')
    const pagesDir = findPagesDir(dir)
    const hasPublicDir = await fileExists(publicDir)

    telemetry.record(
      eventCliSession(PHASE_PRODUCTION_BUILD, dir, {
        webpackVersion: isWebpack5 ? 5 : 4,
        cliCommand: 'build',
        isSrcDir: path.relative(dir, pagesDir!).startsWith('src'),
        hasNowJson: !!(await findUp('now.json', { cwd: dir })),
        isCustomServer: null,
      })
    )

    eventNextPlugins(path.resolve(dir)).then((events) =>
      telemetry.record(events)
    )

    const ignoreTypeScriptErrors = Boolean(config.typescript?.ignoreBuildErrors)
    const typeCheckStart = process.hrtime()
    const typeCheckingSpinner = createSpinner({
      prefixText: `${Log.prefixes.info} ${
        ignoreTypeScriptErrors
          ? 'Skipping validation of types'
          : 'Checking validity of types'
      }`,
    })

    const verifyResult = await nextBuildSpan
      .traceChild('verify-typescript-setup')
      .traceAsyncFn(() =>
        verifyTypeScriptSetup(
          dir,
          pagesDir,
          !ignoreTypeScriptErrors,
          !config.images.disableStaticImages,
          cacheDir
        )
      )

    const typeCheckEnd = process.hrtime(typeCheckStart)

    if (!ignoreTypeScriptErrors) {
      telemetry.record(
        eventTypeCheckCompleted({
          durationInSeconds: typeCheckEnd[0],
          typescriptVersion: verifyResult.version,
          inputFilesCount: verifyResult.result?.inputFilesCount,
          totalFilesCount: verifyResult.result?.totalFilesCount,
          incremental: verifyResult.result?.incremental,
        })
      )
    }

    if (typeCheckingSpinner) {
      typeCheckingSpinner.stopAndPersist()
    }

    const ignoreESLint = Boolean(config.eslint?.ignoreDuringBuilds)
    const lintDirs = config.eslint?.dirs
    if (!ignoreESLint && runLint) {
      await nextBuildSpan
        .traceChild('verify-and-lint')
        .traceAsyncFn(async () => {
          await verifyAndLint(
            dir,
            lintDirs,
            config.experimental.cpus,
            config.experimental.workerThreads,
            telemetry
          )
        })
    }

    const buildSpinner = createSpinner({
      prefixText: `${Log.prefixes.info} Creating an optimized production build`,
    })

    const isLikeServerless = isTargetLikeServerless(target)

    const pagePaths: string[] = await nextBuildSpan
      .traceChild('collect-pages')
      .traceAsyncFn(() => collectPages(pagesDir, config.pageExtensions))

    // needed for static exporting since we want to replace with HTML
    // files
    const allStaticPages = new Set<string>()
    let allPageInfos = new Map<string, PageInfo>()

    const previewProps: __ApiPreviewProps = {
      previewModeId: crypto.randomBytes(16).toString('hex'),
      previewModeSigningKey: crypto.randomBytes(32).toString('hex'),
      previewModeEncryptionKey: crypto.randomBytes(32).toString('hex'),
    }

    const mappedPages = nextBuildSpan
      .traceChild('create-pages-mapping')
      .traceFn(() => createPagesMapping(pagePaths, config.pageExtensions))
    const entrypoints = nextBuildSpan
      .traceChild('create-entrypoints')
      .traceFn(() =>
        createEntrypoints(
          mappedPages,
          target,
          buildId,
          previewProps,
          config,
          loadedEnvFiles
        )
      )
    const pageKeys = Object.keys(mappedPages)
    const conflictingPublicFiles: string[] = []
    const hasCustomErrorPage: boolean = mappedPages['/_error'].startsWith(
      'private-next-pages'
    )
    const hasPages404 = Boolean(
      mappedPages['/404'] &&
        mappedPages['/404'].startsWith('private-next-pages')
    )

    if (hasPublicDir) {
      const hasPublicUnderScoreNextDir = await fileExists(
        path.join(publicDir, '_next')
      )
      if (hasPublicUnderScoreNextDir) {
        throw new Error(PUBLIC_DIR_MIDDLEWARE_CONFLICT)
      }
    }

    await nextBuildSpan
      .traceChild('public-dir-conflict-check')
      .traceAsyncFn(async () => {
        // Check if pages conflict with files in `public`
        // Only a page of public file can be served, not both.
        for (const page in mappedPages) {
          const hasPublicPageFile = await fileExists(
            path.join(publicDir, page === '/' ? '/index' : page),
            'file'
          )
          if (hasPublicPageFile) {
            conflictingPublicFiles.push(page)
          }
        }

        const numConflicting = conflictingPublicFiles.length

        if (numConflicting) {
          throw new Error(
            `Conflicting public and page file${
              numConflicting === 1 ? ' was' : 's were'
            } found. https://nextjs.org/docs/messages/conflicting-public-file-page\n${conflictingPublicFiles.join(
              '\n'
            )}`
          )
        }
      })

    const nestedReservedPages = pageKeys.filter((page) => {
      return (
        page.match(/\/(_app|_document|_error)$/) && path.dirname(page) !== '/'
      )
    })

    if (nestedReservedPages.length) {
      Log.warn(
        `The following reserved Next.js pages were detected not directly under the pages directory:\n` +
          nestedReservedPages.join('\n') +
          `\nSee more info here: https://nextjs.org/docs/messages/nested-reserved-page\n`
      )
    }

    const restrictedRedirectPaths = ['/_next'].map((p) =>
      config.basePath ? `${config.basePath}${p}` : p
    )

    const buildCustomRoute = (
      r: {
        source: string
        locale?: false
        basePath?: false
        statusCode?: number
        destination?: string
      },
      type: RouteType
    ) => {
      const keys: any[] = []

      const routeRegex = pathToRegexp(r.source, keys, {
        strict: true,
        sensitive: false,
        delimiter: '/', // default is `/#?`, but Next does not pass query info
      })
      let regexSource = routeRegex.source

      if (!(r as any).internal) {
        regexSource = modifyRouteRegex(
          routeRegex.source,
          type === 'redirect' ? restrictedRedirectPaths : undefined
        )
      }

      return {
        ...r,
        ...(type === 'redirect'
          ? {
              statusCode: getRedirectStatus(r as Redirect),
              permanent: undefined,
            }
          : {}),
        regex: normalizeRouteRegex(regexSource),
      }
    }

    const routesManifestPath = path.join(distDir, ROUTES_MANIFEST)
    const routesManifest: {
      version: number
      pages404: boolean
      basePath: string
      redirects: Array<ReturnType<typeof buildCustomRoute>>
      rewrites:
        | Array<ReturnType<typeof buildCustomRoute>>
        | {
            beforeFiles: Array<ReturnType<typeof buildCustomRoute>>
            afterFiles: Array<ReturnType<typeof buildCustomRoute>>
            fallback: Array<ReturnType<typeof buildCustomRoute>>
          }
      headers: Array<ReturnType<typeof buildCustomRoute>>
      dynamicRoutes: Array<{
        page: string
        regex: string
        namedRegex?: string
        routeKeys?: { [key: string]: string }
      }>
      dataRoutes: Array<{
        page: string
        routeKeys?: { [key: string]: string }
        dataRouteRegex: string
        namedDataRouteRegex?: string
      }>
      i18n?: {
        domains?: Array<{
          http?: true
          domain: string
          locales?: string[]
          defaultLocale: string
        }>
        locales: string[]
        defaultLocale: string
        localeDetection?: false
      }
    } = nextBuildSpan.traceChild('generate-routes-manifest').traceFn(() => ({
      version: 3,
      pages404: true,
      basePath: config.basePath,
      redirects: redirects.map((r: any) => buildCustomRoute(r, 'redirect')),
      headers: headers.map((r: any) => buildCustomRoute(r, 'header')),
      dynamicRoutes: getSortedRoutes(pageKeys)
        .filter(isDynamicRoute)
        .map((page) => {
          const routeRegex = getRouteRegex(page)
          return {
            page,
            regex: normalizeRouteRegex(routeRegex.re.source),
            routeKeys: routeRegex.routeKeys,
            namedRegex: routeRegex.namedRegex,
          }
        }),
      dataRoutes: [],
      i18n: config.i18n || undefined,
    }))

    if (rewrites.beforeFiles.length === 0 && rewrites.fallback.length === 0) {
      routesManifest.rewrites = rewrites.afterFiles.map((r: any) =>
        buildCustomRoute(r, 'rewrite')
      )
    } else {
      routesManifest.rewrites = {
        beforeFiles: rewrites.beforeFiles.map((r: any) =>
          buildCustomRoute(r, 'rewrite')
        ),
        afterFiles: rewrites.afterFiles.map((r: any) =>
          buildCustomRoute(r, 'rewrite')
        ),
        fallback: rewrites.fallback.map((r: any) =>
          buildCustomRoute(r, 'rewrite')
        ),
      }
    }
    const combinedRewrites: Rewrite[] = [
      ...rewrites.beforeFiles,
      ...rewrites.afterFiles,
      ...rewrites.fallback,
    ]

    const distDirCreated = await nextBuildSpan
      .traceChild('create-dist-dir')
      .traceAsyncFn(async () => {
        try {
          await promises.mkdir(distDir, { recursive: true })
          return true
        } catch (err) {
          if (err.code === 'EPERM') {
            return false
          }
          throw err
        }
      })

    if (!distDirCreated || !(await isWriteable(distDir))) {
      throw new Error(
        '> Build directory is not writeable. https://nextjs.org/docs/messages/build-dir-not-writeable'
      )
    }

    if (config.cleanDistDir) {
      await recursiveDelete(distDir, /^cache/)
    }

    // We need to write the manifest with rewrites before build
    // so serverless can import the manifest
    await nextBuildSpan
      .traceChild('write-routes-manifest')
      .traceAsyncFn(() =>
        promises.writeFile(
          routesManifestPath,
          JSON.stringify(routesManifest),
          'utf8'
        )
      )

    const manifestPath = path.join(
      distDir,
      isLikeServerless ? SERVERLESS_DIRECTORY : SERVER_DIRECTORY,
      PAGES_MANIFEST
    )

    const requiredServerFiles = nextBuildSpan
      .traceChild('generate-required-server-files')
      .traceFn(() => ({
        version: 1,
        config: {
          ...config,
          compress: false,
          configFile: undefined,
        },
        appDir: dir,
        files: [
          ROUTES_MANIFEST,
          path.relative(distDir, manifestPath),
          BUILD_MANIFEST,
          PRERENDER_MANIFEST,
          REACT_LOADABLE_MANIFEST,
          config.optimizeFonts
            ? path.join(
                isLikeServerless ? SERVERLESS_DIRECTORY : SERVER_DIRECTORY,
                FONT_MANIFEST
              )
            : null,
          BUILD_ID_FILE,
        ]
          .filter(nonNullable)
          .map((file) => path.join(config.distDir, file)),
        ignore: [] as string[],
      }))

    const configs = await nextBuildSpan
      .traceChild('generate-webpack-config')
      .traceAsyncFn(() =>
        Promise.all([
          getBaseWebpackConfig(dir, {
            buildId,
            reactProductionProfiling,
            isServer: false,
            config,
            target,
            pagesDir,
            entrypoints: entrypoints.client,
            rewrites,
          }),
          getBaseWebpackConfig(dir, {
            buildId,
            reactProductionProfiling,
            isServer: true,
            config,
            target,
            pagesDir,
            entrypoints: entrypoints.server,
            rewrites,
          }),
        ])
      )

    const clientConfig = configs[0]

    if (
      clientConfig.optimization &&
      (clientConfig.optimization.minimize !== true ||
        (clientConfig.optimization.minimizer &&
          clientConfig.optimization.minimizer.length === 0))
    ) {
      Log.warn(
        `Production code optimization has been disabled in your project. Read more: https://nextjs.org/docs/messages/minification-disabled`
      )
    }

    const webpackBuildStart = process.hrtime()

    let result: CompilerResult = { warnings: [], errors: [] }
    // We run client and server compilation separately to optimize for memory usage
    await nextBuildSpan
      .traceChild('run-webpack-compiler')
      .traceAsyncFn(async () => {
        const clientResult = await runCompiler(clientConfig)
        // Fail build if clientResult contains errors
        if (clientResult.errors.length > 0) {
          result = {
            warnings: [...clientResult.warnings],
            errors: [...clientResult.errors],
          }
        } else {
          const serverResult = await runCompiler(configs[1])
          result = {
            warnings: [...clientResult.warnings, ...serverResult.warnings],
            errors: [...clientResult.errors, ...serverResult.errors],
          }
        }
      })

    const webpackBuildEnd = process.hrtime(webpackBuildStart)
    if (buildSpinner) {
      buildSpinner.stopAndPersist()
    }

    result = nextBuildSpan
      .traceChild('format-webpack-messages')
      .traceFn(() => formatWebpackMessages(result))

    if (result.errors.length > 0) {
      // Only keep the first error. Others are often indicative
      // of the same problem, but confuse the reader with noise.
      if (result.errors.length > 1) {
        result.errors.length = 1
      }
      const error = result.errors.join('\n\n')

      console.error(chalk.red('Failed to compile.\n'))

      if (
        error.indexOf('private-next-pages') > -1 &&
        error.indexOf('does not contain a default export') > -1
      ) {
        const page_name_regex = /'private-next-pages\/(?<page_name>[^']*)'/
        const parsed = page_name_regex.exec(error)
        const page_name = parsed && parsed.groups && parsed.groups.page_name
        throw new Error(
          `webpack build failed: found page without a React Component as default export in pages/${page_name}\n\nSee https://nextjs.org/docs/messages/page-without-valid-component for more info.`
        )
      }

      console.error(error)
      console.error()

      if (
        error.indexOf('private-next-pages') > -1 ||
        error.indexOf('__next_polyfill__') > -1
      ) {
        throw new Error(
          '> webpack config.resolve.alias was incorrectly overridden. https://nextjs.org/docs/messages/invalid-resolve-alias'
        )
      }
      throw new Error('> Build failed because of webpack errors')
    } else {
      telemetry.record(
        eventBuildCompleted(pagePaths, {
          durationInSeconds: webpackBuildEnd[0],
        })
      )

      if (result.warnings.length > 0) {
        Log.warn('Compiled with warnings\n')
        console.warn(result.warnings.join('\n\n'))
        console.warn()
      } else {
        Log.info('Compiled successfully')
      }
    }

    const postCompileSpinner = createSpinner({
      prefixText: `${Log.prefixes.info} Collecting page data`,
    })

    const buildManifestPath = path.join(distDir, BUILD_MANIFEST)

    const ssgPages = new Set<string>()
    const ssgStaticFallbackPages = new Set<string>()
    const ssgBlockingFallbackPages = new Set<string>()
    const staticPages = new Set<string>()
    const invalidPages = new Set<string>()
    const hybridAmpPages = new Set<string>()
    const serverPropsPages = new Set<string>()
    const additionalSsgPaths = new Map<string, Array<string>>()
    const additionalSsgPathsEncoded = new Map<string, Array<string>>()
    const pageInfos = new Map<string, PageInfo>()
    const pagesManifest = JSON.parse(
      await promises.readFile(manifestPath, 'utf8')
    ) as PagesManifest
    const buildManifest = JSON.parse(
      await promises.readFile(buildManifestPath, 'utf8')
    ) as BuildManifest

    const analysisBegin = process.hrtime()

    const staticCheckSpan = nextBuildSpan.traceChild('static-check')
    const {
      customAppGetInitialProps,
      namedExports,
      isNextImageImported,
      hasSsrAmpPages,
      hasNonStaticErrorPage,
    } = await staticCheckSpan.traceAsyncFn(async () => {
      process.env.NEXT_PHASE = PHASE_PRODUCTION_BUILD

      const timeout = config.experimental.pageDataCollectionTimeout || 0
      let infoPrinted = false
      const staticCheckWorkers = new Worker(staticCheckWorker, {
        timeout: timeout * 1000,
        onRestart: (_method, [pagePath], attempts) => {
          if (attempts >= 2) {
            throw new Error(
              `Collecting page data for ${pagePath} is still timing out after 2 attempts. See more info here https://nextjs.org/docs/messages/page-data-collection-timeout`
            )
          }
          Log.warn(
            `Restarted collecting page data for ${pagePath} because it took more than ${timeout} seconds`
          )
          if (!infoPrinted) {
            Log.warn(
              'See more info here https://nextjs.org/docs/messages/page-data-collection-timeout'
            )
            infoPrinted = true
          }
        },
        numWorkers: config.experimental.cpus,
        enableWorkerThreads: config.experimental.workerThreads,
        exposedMethods: [
          'hasCustomGetInitialProps',
          'isPageStatic',
          'getNamedExports',
        ],
      }) as Worker &
        Pick<
          typeof import('./utils'),
          'hasCustomGetInitialProps' | 'isPageStatic' | 'getNamedExports'
        >

      const runtimeEnvConfig = {
        publicRuntimeConfig: config.publicRuntimeConfig,
        serverRuntimeConfig: config.serverRuntimeConfig,
      }

      const nonStaticErrorPageSpan = staticCheckSpan.traceChild(
        'check-static-error-page'
      )
      const errorPageHasCustomGetInitialProps = nonStaticErrorPageSpan.traceAsyncFn(
        async () =>
          hasCustomErrorPage &&
          (await staticCheckWorkers.hasCustomGetInitialProps(
            '/_error',
            distDir,
            isLikeServerless,
            runtimeEnvConfig,
            false
          ))
      )

      const errorPageStaticResult = nonStaticErrorPageSpan.traceAsyncFn(
        async () =>
          hasCustomErrorPage &&
          staticCheckWorkers.isPageStatic(
            '/_error',
            distDir,
            isLikeServerless,
            runtimeEnvConfig,
            config.i18n?.locales,
            config.i18n?.defaultLocale
          )
      )

      // we don't output _app in serverless mode so use _app export
      // from _error instead
      const appPageToCheck = isLikeServerless ? '/_error' : '/_app'

      const customAppGetInitialPropsPromise = staticCheckWorkers.hasCustomGetInitialProps(
        appPageToCheck,
        distDir,
        isLikeServerless,
        runtimeEnvConfig,
        true
      )

      const namedExportsPromise = staticCheckWorkers.getNamedExports(
        appPageToCheck,
        distDir,
        isLikeServerless,
        runtimeEnvConfig
      )

      // eslint-disable-next-line no-shadow
      let isNextImageImported: boolean | undefined
      // eslint-disable-next-line no-shadow
      let hasSsrAmpPages = false

      const computedManifestData = await computeFromManifest(
        buildManifest,
        distDir,
        config.experimental.gzipSize
      )
      await Promise.all(
        pageKeys.map(async (page) => {
          const checkPageSpan = staticCheckSpan.traceChild('check-page', {
            page,
          })
          return checkPageSpan.traceAsyncFn(async () => {
            const actualPage = normalizePagePath(page)
            const [selfSize, allSize] = await getJsPageSizeInKb(
              actualPage,
              distDir,
              buildManifest,
              config.experimental.gzipSize,
              computedManifestData
            )

            let isSsg = false
            let isStatic = false
            let isHybridAmp = false
            let ssgPageRoutes: string[] | null = null

            const nonReservedPage = !page.match(
              /^\/(_app|_error|_document|api(\/|$))/
            )

            if (nonReservedPage) {
              try {
                let isPageStaticSpan = checkPageSpan.traceChild(
                  'is-page-static'
                )
                let workerResult = await isPageStaticSpan.traceAsyncFn(() => {
                  return staticCheckWorkers.isPageStatic(
                    page,
                    distDir,
                    isLikeServerless,
                    runtimeEnvConfig,
                    config.i18n?.locales,
                    config.i18n?.defaultLocale,
                    isPageStaticSpan.id
                  )
                })

                if (
                  workerResult.isStatic === false &&
                  (workerResult.isHybridAmp || workerResult.isAmpOnly)
                ) {
                  hasSsrAmpPages = true
                }

                if (workerResult.isHybridAmp) {
                  isHybridAmp = true
                  hybridAmpPages.add(page)
                }

                if (workerResult.isNextImageImported) {
                  isNextImageImported = true
                }

                if (workerResult.hasStaticProps) {
                  ssgPages.add(page)
                  isSsg = true

                  if (
                    workerResult.prerenderRoutes &&
                    workerResult.encodedPrerenderRoutes
                  ) {
                    additionalSsgPaths.set(page, workerResult.prerenderRoutes)
                    additionalSsgPathsEncoded.set(
                      page,
                      workerResult.encodedPrerenderRoutes
                    )
                    ssgPageRoutes = workerResult.prerenderRoutes
                  }

                  if (workerResult.prerenderFallback === 'blocking') {
                    ssgBlockingFallbackPages.add(page)
                  } else if (workerResult.prerenderFallback === true) {
                    ssgStaticFallbackPages.add(page)
                  }
                } else if (workerResult.hasServerProps) {
                  serverPropsPages.add(page)
                } else if (
                  workerResult.isStatic &&
                  (await customAppGetInitialPropsPromise) === false
                ) {
                  staticPages.add(page)
                  isStatic = true
                }

                if (hasPages404 && page === '/404') {
                  if (!workerResult.isStatic && !workerResult.hasStaticProps) {
                    throw new Error(
                      `\`pages/404\` ${STATIC_STATUS_PAGE_GET_INITIAL_PROPS_ERROR}`
                    )
                  }
                  // we need to ensure the 404 lambda is present since we use
                  // it when _app has getInitialProps
                  if (
                    (await customAppGetInitialPropsPromise) &&
                    !workerResult.hasStaticProps
                  ) {
                    staticPages.delete(page)
                  }
                }

                if (
                  STATIC_STATUS_PAGES.includes(page) &&
                  !workerResult.isStatic &&
                  !workerResult.hasStaticProps
                ) {
                  throw new Error(
                    `\`pages${page}\` ${STATIC_STATUS_PAGE_GET_INITIAL_PROPS_ERROR}`
                  )
                }
              } catch (err) {
                if (err.message !== 'INVALID_DEFAULT_EXPORT') throw err
                invalidPages.add(page)
              }
            }

            pageInfos.set(page, {
              size: selfSize,
              totalSize: allSize,
              static: isStatic,
              isSsg,
              isHybridAmp,
              ssgPageRoutes,
              initialRevalidateSeconds: false,
              pageDuration: undefined,
              ssgPageDurations: undefined,
            })
          })
        })
      )

      const errorPageResult = await errorPageStaticResult
      const nonStaticErrorPage =
        (await errorPageHasCustomGetInitialProps) ||
        (errorPageResult && errorPageResult.hasServerProps)

      const returnValue = {
        customAppGetInitialProps: await customAppGetInitialPropsPromise,
        namedExports: await namedExportsPromise,
        isNextImageImported,
        hasSsrAmpPages,
        hasNonStaticErrorPage: nonStaticErrorPage,
      }

      staticCheckWorkers.end()
      return returnValue
    })

    if (customAppGetInitialProps) {
      console.warn(
        chalk.bold.yellow(`Warning: `) +
          chalk.yellow(
            `You have opted-out of Automatic Static Optimization due to \`getInitialProps\` in \`pages/_app\`. This does not opt-out pages with \`getStaticProps\``
          )
      )
      console.warn(
        'Read more: https://nextjs.org/docs/messages/opt-out-auto-static-optimization\n'
      )
    }

    if (!hasSsrAmpPages) {
      requiredServerFiles.ignore.push(
        path.relative(
          dir,
          path.join(
            path.dirname(
              require.resolve(
                'next/dist/compiled/@ampproject/toolbox-optimizer'
              )
            ),
            '**/*'
          )
        )
      )
    }

    if (serverPropsPages.size > 0 || ssgPages.size > 0) {
      // We update the routes manifest after the build with the
      // data routes since we can't determine these until after build
      routesManifest.dataRoutes = getSortedRoutes([
        ...serverPropsPages,
        ...ssgPages,
      ]).map((page) => {
        const pagePath = normalizePagePath(page)
        const dataRoute = path.posix.join(
          '/_next/data',
          buildId,
          `${pagePath}.json`
        )

        let dataRouteRegex: string
        let namedDataRouteRegex: string | undefined
        let routeKeys: { [named: string]: string } | undefined

        if (isDynamicRoute(page)) {
          const routeRegex = getRouteRegex(dataRoute.replace(/\.json$/, ''))

          dataRouteRegex = normalizeRouteRegex(
            routeRegex.re.source.replace(/\(\?:\\\/\)\?\$$/, '\\.json$')
          )
          namedDataRouteRegex = routeRegex.namedRegex!.replace(
            /\(\?:\/\)\?\$$/,
            '\\.json$'
          )
          routeKeys = routeRegex.routeKeys
        } else {
          dataRouteRegex = normalizeRouteRegex(
            new RegExp(
              `^${path.posix.join(
                '/_next/data',
                escapeStringRegexp(buildId),
                `${pagePath}.json`
              )}$`
            ).source
          )
        }

        return {
          page,
          routeKeys,
          dataRouteRegex,
          namedDataRouteRegex,
        }
      })

      await promises.writeFile(
        routesManifestPath,
        JSON.stringify(routesManifest),
        'utf8'
      )
    }

    // Since custom _app.js can wrap the 404 page we have to opt-out of static optimization if it has getInitialProps
    // Only export the static 404 when there is no /_error present
    const useStatic404 =
      !customAppGetInitialProps && (!hasNonStaticErrorPage || hasPages404)

    if (invalidPages.size > 0) {
      throw new Error(
        `Build optimization failed: found page${
          invalidPages.size === 1 ? '' : 's'
        } without a React Component as default export in \n${[...invalidPages]
          .map((pg) => `pages${pg}`)
          .join(
            '\n'
          )}\n\nSee https://nextjs.org/docs/messages/page-without-valid-component for more info.\n`
      )
    }

    await writeBuildId(distDir, buildId)

    if (config.experimental.optimizeCss) {
      const cssFilePaths = getCssFilePaths(buildManifest)

      requiredServerFiles.files.push(
        ...cssFilePaths.map((filePath) => path.join(config.distDir, filePath))
      )
    }

    await promises.writeFile(
      path.join(distDir, SERVER_FILES_MANIFEST),
      JSON.stringify(requiredServerFiles),
      'utf8'
    )

    const finalPrerenderRoutes: { [route: string]: SsgRoute } = {}
    const tbdPrerenderRoutes: string[] = []
    let ssgNotFoundPaths: string[] = []

    if (postCompileSpinner) postCompileSpinner.stopAndPersist()

    const { i18n } = config

    const usedStaticStatusPages = STATIC_STATUS_PAGES.filter(
      (page) =>
        mappedPages[page] && mappedPages[page].startsWith('private-next-pages')
    )
    usedStaticStatusPages.forEach((page) => {
      if (!ssgPages.has(page) && !customAppGetInitialProps) {
        staticPages.add(page)
      }
    })

    const hasPages500 = usedStaticStatusPages.includes('/500')
    const useDefaultStatic500 =
      !hasPages500 && !hasNonStaticErrorPage && !customAppGetInitialProps

    const combinedPages = [...staticPages, ...ssgPages]

    if (combinedPages.length > 0 || useStatic404 || useDefaultStatic500) {
      const staticGenerationSpan = nextBuildSpan.traceChild('static-generation')
      await staticGenerationSpan.traceAsyncFn(async () => {
        detectConflictingPaths(
          [
            ...combinedPages,
            ...pageKeys.filter((page) => !combinedPages.includes(page)),
          ],
          ssgPages,
          additionalSsgPaths
        )
        const exportApp = require('../export').default
        const exportOptions = {
          silent: false,
          buildExport: true,
          threads: config.experimental.cpus,
          pages: combinedPages,
          outdir: path.join(distDir, 'export'),
          statusMessage: 'Generating static pages',
        }
        const exportConfig: any = {
          ...config,
          initialPageRevalidationMap: {},
          pageDurationMap: {},
          ssgNotFoundPaths: [] as string[],
          // Default map will be the collection of automatic statically exported
          // pages and incremental pages.
          // n.b. we cannot handle this above in combinedPages because the dynamic
          // page must be in the `pages` array, but not in the mapping.
          exportPathMap: (defaultMap: any) => {
            // Dynamically routed pages should be prerendered to be used as
            // a client-side skeleton (fallback) while data is being fetched.
            // This ensures the end-user never sees a 500 or slow response from the
            // server.
            //
            // Note: prerendering disables automatic static optimization.
            ssgPages.forEach((page) => {
              if (isDynamicRoute(page)) {
                tbdPrerenderRoutes.push(page)

                if (ssgStaticFallbackPages.has(page)) {
                  // Override the rendering for the dynamic page to be treated as a
                  // fallback render.
                  if (i18n) {
                    defaultMap[`/${i18n.defaultLocale}${page}`] = {
                      page,
                      query: { __nextFallback: true },
                    }
                  } else {
                    defaultMap[page] = { page, query: { __nextFallback: true } }
                  }
                } else {
                  // Remove dynamically routed pages from the default path map when
                  // fallback behavior is disabled.
                  delete defaultMap[page]
                }
              }
            })
            // Append the "well-known" routes we should prerender for, e.g. blog
            // post slugs.
            additionalSsgPaths.forEach((routes, page) => {
              const encodedRoutes = additionalSsgPathsEncoded.get(page)

              routes.forEach((route, routeIdx) => {
                defaultMap[route] = {
                  page,
                  query: { __nextSsgPath: encodedRoutes?.[routeIdx] },
                }
              })
            })

            if (useStatic404) {
              defaultMap['/404'] = {
                page: hasPages404 ? '/404' : '/_error',
              }
            }

            if (useDefaultStatic500) {
              defaultMap['/500'] = {
                page: '/_error',
              }
            }

            if (i18n) {
              for (const page of [
                ...staticPages,
                ...ssgPages,
                ...(useStatic404 ? ['/404'] : []),
                ...(useDefaultStatic500 ? ['/500'] : []),
              ]) {
                const isSsg = ssgPages.has(page)
                const isDynamic = isDynamicRoute(page)
                const isFallback = isSsg && ssgStaticFallbackPages.has(page)

                for (const locale of i18n.locales) {
                  // skip fallback generation for SSG pages without fallback mode
                  if (isSsg && isDynamic && !isFallback) continue
                  const outputPath = `/${locale}${page === '/' ? '' : page}`

                  defaultMap[outputPath] = {
                    page: defaultMap[page]?.page || page,
                    query: { __nextLocale: locale },
                  }

                  if (isFallback) {
                    defaultMap[outputPath].query.__nextFallback = true
                  }
                }

                if (isSsg) {
                  // remove non-locale prefixed variant from defaultMap
                  delete defaultMap[page]
                }
              }
            }
            return defaultMap
          },
        }

        await exportApp(dir, exportOptions, exportConfig)

        const postBuildSpinner = createSpinner({
          prefixText: `${Log.prefixes.info} Finalizing page optimization`,
        })
        ssgNotFoundPaths = exportConfig.ssgNotFoundPaths

        // remove server bundles that were exported
        for (const page of staticPages) {
          const serverBundle = getPagePath(page, distDir, isLikeServerless)
          await promises.unlink(serverBundle)
        }
        const serverOutputDir = path.join(
          distDir,
          isLikeServerless ? SERVERLESS_DIRECTORY : SERVER_DIRECTORY
        )

        const moveExportedPage = async (
          originPage: string,
          page: string,
          file: string,
          isSsg: boolean,
          ext: 'html' | 'json',
          additionalSsgFile = false
        ) => {
          return staticGenerationSpan
            .traceChild('move-exported-page')
            .traceAsyncFn(async () => {
              file = `${file}.${ext}`
              const orig = path.join(exportOptions.outdir, file)
              const pagePath = getPagePath(
                originPage,
                distDir,
                isLikeServerless
              )

              const relativeDest = path
                .relative(
                  serverOutputDir,
                  path.join(
                    path.join(
                      pagePath,
                      // strip leading / and then recurse number of nested dirs
                      // to place from base folder
                      originPage
                        .substr(1)
                        .split('/')
                        .map(() => '..')
                        .join('/')
                    ),
                    file
                  )
                )
                .replace(/\\/g, '/')

              const dest = path.join(
                distDir,
                isLikeServerless ? SERVERLESS_DIRECTORY : SERVER_DIRECTORY,
                relativeDest
              )

              if (
                !isSsg &&
                !(
                  // don't add static status page to manifest if it's
                  // the default generated version e.g. no pages/500
                  (
                    STATIC_STATUS_PAGES.includes(page) &&
                    !usedStaticStatusPages.includes(page)
                  )
                )
              ) {
                pagesManifest[page] = relativeDest
              }

              const isNotFound = ssgNotFoundPaths.includes(page)

              // for SSG files with i18n the non-prerendered variants are
              // output with the locale prefixed so don't attempt moving
              // without the prefix
              if ((!i18n || additionalSsgFile) && !isNotFound) {
                await promises.mkdir(path.dirname(dest), { recursive: true })
                await promises.rename(orig, dest)
              } else if (i18n && !isSsg) {
                // this will be updated with the locale prefixed variant
                // since all files are output with the locale prefix
                delete pagesManifest[page]
              }

              if (i18n) {
                if (additionalSsgFile) return

                for (const locale of i18n.locales) {
                  const curPath = `/${locale}${page === '/' ? '' : page}`
                  const localeExt = page === '/' ? path.extname(file) : ''
                  const relativeDestNoPages = relativeDest.substr(
                    'pages/'.length
                  )

                  if (isSsg && ssgNotFoundPaths.includes(curPath)) {
                    continue
                  }

                  const updatedRelativeDest = path
                    .join(
                      'pages',
                      locale + localeExt,
                      // if it's the top-most index page we want it to be locale.EXT
                      // instead of locale/index.html
                      page === '/' ? '' : relativeDestNoPages
                    )
                    .replace(/\\/g, '/')

                  const updatedOrig = path.join(
                    exportOptions.outdir,
                    locale + localeExt,
                    page === '/' ? '' : file
                  )
                  const updatedDest = path.join(
                    distDir,
                    isLikeServerless ? SERVERLESS_DIRECTORY : SERVER_DIRECTORY,
                    updatedRelativeDest
                  )

                  if (!isSsg) {
                    pagesManifest[curPath] = updatedRelativeDest
                  }
                  await promises.mkdir(path.dirname(updatedDest), {
                    recursive: true,
                  })
                  await promises.rename(updatedOrig, updatedDest)
                }
              }
            })
        }

        // Only move /404 to /404 when there is no custom 404 as in that case we don't know about the 404 page
        if (!hasPages404 && useStatic404) {
          await moveExportedPage('/_error', '/404', '/404', false, 'html')
        }

        if (useDefaultStatic500) {
          await moveExportedPage('/_error', '/500', '/500', false, 'html')
        }

        for (const page of combinedPages) {
          const isSsg = ssgPages.has(page)
          const isStaticSsgFallback = ssgStaticFallbackPages.has(page)
          const isDynamic = isDynamicRoute(page)
          const hasAmp = hybridAmpPages.has(page)
          const file = normalizePagePath(page)

          const pageInfo = pageInfos.get(page)
          const durationInfo = exportConfig.pageDurationMap[page]
          if (pageInfo && durationInfo) {
            // Set Build Duration
            if (pageInfo.ssgPageRoutes) {
              pageInfo.ssgPageDurations = pageInfo.ssgPageRoutes.map(
                (pagePath) => durationInfo[pagePath]
              )
            }
            pageInfo.pageDuration = durationInfo[page]
          }

          // The dynamic version of SSG pages are only prerendered if the
          // fallback is enabled. Below, we handle the specific prerenders
          // of these.
          const hasHtmlOutput = !(isSsg && isDynamic && !isStaticSsgFallback)

          if (hasHtmlOutput) {
            await moveExportedPage(page, page, file, isSsg, 'html')
          }

          if (hasAmp && (!isSsg || (isSsg && !isDynamic))) {
            const ampPage = `${file}.amp`
            await moveExportedPage(page, ampPage, ampPage, isSsg, 'html')

            if (isSsg) {
              await moveExportedPage(page, ampPage, ampPage, isSsg, 'json')
            }
          }

          if (isSsg) {
            // For a non-dynamic SSG page, we must copy its data file
            // from export, we already moved the HTML file above
            if (!isDynamic) {
              await moveExportedPage(page, page, file, isSsg, 'json')

              if (i18n) {
                // TODO: do we want to show all locale variants in build output
                for (const locale of i18n.locales) {
                  const localePage = `/${locale}${page === '/' ? '' : page}`

                  if (!ssgNotFoundPaths.includes(localePage)) {
                    finalPrerenderRoutes[localePage] = {
                      initialRevalidateSeconds:
                        exportConfig.initialPageRevalidationMap[localePage],
                      srcRoute: null,
                      dataRoute: path.posix.join(
                        '/_next/data',
                        buildId,
                        `${file}.json`
                      ),
                    }
                  }
                }
              } else {
                finalPrerenderRoutes[page] = {
                  initialRevalidateSeconds:
                    exportConfig.initialPageRevalidationMap[page],
                  srcRoute: null,
                  dataRoute: path.posix.join(
                    '/_next/data',
                    buildId,
                    `${file}.json`
                  ),
                }
              }
              // Set Page Revalidation Interval
              if (pageInfo) {
                pageInfo.initialRevalidateSeconds =
                  exportConfig.initialPageRevalidationMap[page]
              }
            } else {
              // For a dynamic SSG page, we did not copy its data exports and only
              // copy the fallback HTML file (if present).
              // We must also copy specific versions of this page as defined by
              // `getStaticPaths` (additionalSsgPaths).
              const extraRoutes = additionalSsgPaths.get(page) || []
              for (const route of extraRoutes) {
                const pageFile = normalizePagePath(route)
                await moveExportedPage(
                  page,
                  route,
                  pageFile,
                  isSsg,
                  'html',
                  true
                )
                await moveExportedPage(
                  page,
                  route,
                  pageFile,
                  isSsg,
                  'json',
                  true
                )

                if (hasAmp) {
                  const ampPage = `${pageFile}.amp`
                  await moveExportedPage(
                    page,
                    ampPage,
                    ampPage,
                    isSsg,
                    'html',
                    true
                  )
                  await moveExportedPage(
                    page,
                    ampPage,
                    ampPage,
                    isSsg,
                    'json',
                    true
                  )
                }

                finalPrerenderRoutes[route] = {
                  initialRevalidateSeconds:
                    exportConfig.initialPageRevalidationMap[route],
                  srcRoute: page,
                  dataRoute: path.posix.join(
                    '/_next/data',
                    buildId,
                    `${normalizePagePath(route)}.json`
                  ),
                }

                // Set route Revalidation Interval
                if (pageInfo) {
                  pageInfo.initialRevalidateSeconds =
                    exportConfig.initialPageRevalidationMap[route]
                }
              }
            }
          }
        }

        // remove temporary export folder
        await recursiveDelete(exportOptions.outdir)
        await promises.rmdir(exportOptions.outdir)
        await promises.writeFile(
          manifestPath,
          JSON.stringify(pagesManifest, null, 2),
          'utf8'
        )

        if (postBuildSpinner) postBuildSpinner.stopAndPersist()
        console.log()
      })
    }

    const analysisEnd = process.hrtime(analysisBegin)
    telemetry.record(
      eventBuildOptimize(pagePaths, {
        durationInSeconds: analysisEnd[0],
        staticPageCount: staticPages.size,
        staticPropsPageCount: ssgPages.size,
        serverPropsPageCount: serverPropsPages.size,
        ssrPageCount:
          pagePaths.length -
          (staticPages.size + ssgPages.size + serverPropsPages.size),
        hasStatic404: useStatic404,
        hasReportWebVitals: namedExports?.includes('reportWebVitals') ?? false,
        rewritesCount: combinedRewrites.length,
        headersCount: headers.length,
        redirectsCount: redirects.length - 1, // reduce one for trailing slash
        headersWithHasCount: headers.filter((r: any) => !!r.has).length,
        rewritesWithHasCount: combinedRewrites.filter((r: any) => !!r.has)
          .length,
        redirectsWithHasCount: redirects.filter((r: any) => !!r.has).length,
      })
    )

    if (ssgPages.size > 0) {
      const finalDynamicRoutes: PrerenderManifest['dynamicRoutes'] = {}
      tbdPrerenderRoutes.forEach((tbdRoute) => {
        const normalizedRoute = normalizePagePath(tbdRoute)
        const dataRoute = path.posix.join(
          '/_next/data',
          buildId,
          `${normalizedRoute}.json`
        )

        finalDynamicRoutes[tbdRoute] = {
          routeRegex: normalizeRouteRegex(getRouteRegex(tbdRoute).re.source),
          dataRoute,
          fallback: ssgBlockingFallbackPages.has(tbdRoute)
            ? null
            : ssgStaticFallbackPages.has(tbdRoute)
            ? `${normalizedRoute}.html`
            : false,
          dataRouteRegex: normalizeRouteRegex(
            getRouteRegex(dataRoute.replace(/\.json$/, '')).re.source.replace(
              /\(\?:\\\/\)\?\$$/,
              '\\.json$'
            )
          ),
        }
      })
      const prerenderManifest: PrerenderManifest = {
        version: 3,
        routes: finalPrerenderRoutes,
        dynamicRoutes: finalDynamicRoutes,
        notFoundRoutes: ssgNotFoundPaths,
        preview: previewProps,
      }

      await promises.writeFile(
        path.join(distDir, PRERENDER_MANIFEST),
        JSON.stringify(prerenderManifest),
        'utf8'
      )
      await generateClientSsgManifest(prerenderManifest, {
        distDir,
        buildId,
        locales: config.i18n?.locales || [],
      })
    } else {
      const prerenderManifest: PrerenderManifest = {
        version: 3,
        routes: {},
        dynamicRoutes: {},
        preview: previewProps,
        notFoundRoutes: [],
      }
      await promises.writeFile(
        path.join(distDir, PRERENDER_MANIFEST),
        JSON.stringify(prerenderManifest),
        'utf8'
      )
    }

    const images = { ...config.images }
    const { deviceSizes, imageSizes } = images
    ;(images as any).sizes = [...deviceSizes, ...imageSizes]

    await promises.writeFile(
      path.join(distDir, IMAGES_MANIFEST),
      JSON.stringify({
        version: 1,
        images,
      }),
      'utf8'
    )
    await promises.writeFile(
      path.join(distDir, EXPORT_MARKER),
      JSON.stringify({
        version: 1,
        hasExportPathMap: typeof config.exportPathMap === 'function',
        exportTrailingSlash: config.trailingSlash === true,
        isNextImageImported: isNextImageImported === true,
      }),
      'utf8'
    )
    await promises.unlink(path.join(distDir, EXPORT_DETAIL)).catch((err) => {
      if (err.code === 'ENOENT') {
        return Promise.resolve()
      }
      return Promise.reject(err)
    })

    staticPages.forEach((pg) => allStaticPages.add(pg))
    pageInfos.forEach((info: PageInfo, key: string) => {
      allPageInfos.set(key, info)
    })

    await nextBuildSpan.traceChild('print-tree-view').traceAsyncFn(() =>
      printTreeView(Object.keys(mappedPages), allPageInfos, isLikeServerless, {
        distPath: distDir,
        buildId: buildId,
        pagesDir,
        useStatic404,
        pageExtensions: config.pageExtensions,
        buildManifest,
        gzipSize: config.experimental.gzipSize,
      })
    )

    if (debugOutput) {
      nextBuildSpan
        .traceChild('print-custom-routes')
        .traceFn(() => printCustomRoutes({ redirects, rewrites, headers }))
    }

    if (config.analyticsId) {
      console.log(
        chalk.bold.green('Next.js Analytics') +
          ' is enabled for this production build. ' +
          "You'll receive a Real Experience Score computed by all of your visitors."
      )
      console.log('')
    }

    await nextBuildSpan
      .traceChild('telemetry-flush')
      .traceAsyncFn(() => telemetry.flush())
  })
}

export type ClientSsgManifest = Set<string>

function generateClientSsgManifest(
  prerenderManifest: PrerenderManifest,
  {
    buildId,
    distDir,
    locales,
  }: { buildId: string; distDir: string; locales: string[] }
) {
  const ssgPages: ClientSsgManifest = new Set<string>([
    ...Object.entries(prerenderManifest.routes)
      // Filter out dynamic routes
      .filter(([, { srcRoute }]) => srcRoute == null)
      .map(([route]) => normalizeLocalePath(route, locales).pathname),
    ...Object.keys(prerenderManifest.dynamicRoutes),
  ])

  const clientSsgManifestContent = `self.__SSG_MANIFEST=${devalue(
    ssgPages
  )};self.__SSG_MANIFEST_CB&&self.__SSG_MANIFEST_CB()`

  writeFileSync(
    path.join(distDir, CLIENT_STATIC_FILES_PATH, buildId, '_ssgManifest.js'),
    clientSsgManifestContent
  )
}
