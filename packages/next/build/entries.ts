import type {
  PageRuntime,
  NextConfigComplete,
  NextConfig,
} from '../server/config-shared'
import type { webpack5 } from 'next/dist/compiled/webpack/webpack'
import fs from 'fs'
import chalk from 'next/dist/compiled/chalk'
import { posix, join } from 'path'
import { stringify } from 'querystring'
import { API_ROUTE, DOT_NEXT_ALIAS, PAGES_DIR_ALIAS } from '../lib/constants'
import { MIDDLEWARE_ROUTE } from '../lib/constants'
import { __ApiPreviewProps } from '../server/api-utils'
import { isTargetLikeServerless } from '../server/utils'
import { normalizePagePath } from '../server/normalize-page-path'
import { normalizePathSep } from '../server/denormalize-page-path'
import { warn } from './output/log'
import { MiddlewareLoaderOptions } from './webpack/loaders/next-middleware-loader'
import { ClientPagesLoaderOptions } from './webpack/loaders/next-client-pages-loader'
import { ServerlessLoaderQuery } from './webpack/loaders/next-serverless-loader'
import { LoadedEnvFiles } from '@next/env'
import { parse } from '../build/swc'
import {
  getRawPageExtensions,
  isCustomErrorPage,
  isFlightPage,
  isReservedPage,
} from './utils'
import { ssrEntries } from './webpack/plugins/middleware-plugin'
import {
  MIDDLEWARE_RUNTIME_WEBPACK,
  MIDDLEWARE_SSR_RUNTIME_WEBPACK,
} from '../shared/lib/constants'

type ObjectValue<T> = T extends { [key: string]: infer V } ? V : never

export function getPageFromPath(pagePath: string, pageExtensions: string[]) {
  const extensions = pagePath.includes('/_app.server.')
    ? getRawPageExtensions(pageExtensions)
    : pageExtensions

  const page = normalizePathSep(
    pagePath.replace(new RegExp(`\\.+(${extensions.join('|')})$`), '')
  ).replace(/\/index$/, '')

  return page === '' ? '/' : page
}

export function createPagesMapping({
  hasServerComponents,
  isDev,
  pageExtensions,
  pagePaths,
}: {
  hasServerComponents: boolean
  isDev: boolean
  pageExtensions: string[]
  pagePaths: string[]
}): { [page: string]: string } {
  const previousPages: { [key: string]: string } = {}
  const pages = pagePaths.reduce<{ [key: string]: string }>(
    (result, pagePath) => {
      // Do not process .d.ts files inside the `pages` folder
      if (pagePath.endsWith('.d.ts') && pageExtensions.includes('ts')) {
        return result
      }

      const pageKey = getPageFromPath(pagePath, pageExtensions)

      // Assume that if there's a Client Component, that there is
      // a matching Server Component that will map to the page.
      // so we will not process it
      if (hasServerComponents && /\.client$/.test(pageKey)) {
        return result
      }

      if (pageKey in result) {
        warn(
          `Duplicate page detected. ${chalk.cyan(
            join('pages', previousPages[pageKey])
          )} and ${chalk.cyan(
            join('pages', pagePath)
          )} both resolve to ${chalk.cyan(pageKey)}.`
        )
      } else {
        previousPages[pageKey] = pagePath
      }
      result[pageKey] = normalizePathSep(join(PAGES_DIR_ALIAS, pagePath))
      return result
    },
    {}
  )

  // In development we always alias these to allow Webpack to fallback to
  // the correct source file so that HMR can work properly when a file is
  // added or removed.
  if (isDev) {
    delete pages['/_app']
    delete pages['/_app.server']
    delete pages['/_error']
    delete pages['/_document']
  }

  const root = isDev ? PAGES_DIR_ALIAS : 'next/dist/pages'
  return {
    '/_app': `${root}/_app`,
    '/_error': `${root}/_error`,
    '/_document': `${root}/_document`,
    ...(hasServerComponents ? { '/_app.server': `${root}/_app.server` } : {}),
    ...pages,
  }
}

type Entrypoints = {
  client: webpack5.EntryObject
  server: webpack5.EntryObject
  edgeServer: webpack5.EntryObject
}

const cachedPageRuntimeConfig = new Map<string, [number, PageRuntime]>()

// @TODO: We should limit the maximum concurrency of this function as there
// could be thousands of pages existing.
export async function getPageRuntime(
  pageFilePath: string,
  nextConfig: Partial<NextConfig>,
  isDev?: boolean
): Promise<PageRuntime> {
  if (!nextConfig.experimental?.reactRoot) return undefined

  const globalRuntime = nextConfig.experimental?.runtime
  const cached = cachedPageRuntimeConfig.get(pageFilePath)
  if (cached) {
    return cached[1]
  }

  let pageContent: string
  try {
    pageContent = await fs.promises.readFile(pageFilePath, {
      encoding: 'utf8',
    })
  } catch (err) {
    if (!isDev) throw err
    return undefined
  }

  // When gSSP or gSP is used, this page requires an execution runtime. If the
  // page config is not present, we fallback to the global runtime. Related
  // discussion:
  // https://github.com/vercel/next.js/discussions/34179
  let isRuntimeRequired: boolean = false
  let pageRuntime: PageRuntime = undefined

  // Since these configurations should always be static analyzable, we can
  // skip these cases that "runtime" and "gSP", "gSSP" are not included in the
  // source code.
  if (/runtime|getStaticProps|getServerSideProps/.test(pageContent)) {
    try {
      const { body } = await parse(pageContent, {
        filename: pageFilePath,
        isModule: 'unknown',
      })

      for (const node of body) {
        const { type, declaration } = node
        if (type === 'ExportDeclaration') {
          // Match `export const config`
          const valueNode = declaration?.declarations?.[0]
          if (valueNode?.id?.value === 'config') {
            const props = valueNode.init.properties
            const runtimeKeyValue = props.find(
              (prop: any) => prop.key.value === 'runtime'
            )
            const runtime = runtimeKeyValue?.value?.value
            pageRuntime =
              runtime === 'edge' || runtime === 'nodejs' ? runtime : pageRuntime
          } else if (declaration?.type === 'FunctionDeclaration') {
            // Match `export function getStaticProps | getServerSideProps`
            const identifier = declaration.identifier?.value
            if (
              identifier === 'getStaticProps' ||
              identifier === 'getServerSideProps'
            ) {
              isRuntimeRequired = true
            }
          }
        } else if (type === 'ExportNamedDeclaration') {
          // Match `export { getStaticProps | getServerSideProps } <from '../..'>`
          const { specifiers } = node
          for (const specifier of specifiers) {
            const { orig } = specifier
            const hasDataFetchingExports =
              specifier.type === 'ExportSpecifier' &&
              orig?.type === 'Identifier' &&
              (orig?.value === 'getStaticProps' ||
                orig?.value === 'getServerSideProps')
            if (hasDataFetchingExports) {
              isRuntimeRequired = true
              break
            }
          }
        }
      }
    } catch (err) {}
  }

  if (!pageRuntime) {
    if (isRuntimeRequired) {
      pageRuntime = globalRuntime
    }
  }

  cachedPageRuntimeConfig.set(pageFilePath, [Date.now(), pageRuntime])
  return pageRuntime
}

export function invalidatePageRuntimeCache(
  pageFilePath: string,
  safeTime: number
) {
  const cached = cachedPageRuntimeConfig.get(pageFilePath)
  if (cached && cached[0] < safeTime) {
    cachedPageRuntimeConfig.delete(pageFilePath)
  }
}

export async function createEntrypoints(
  pages: { [page: string]: string },
  target: 'server' | 'serverless' | 'experimental-serverless-trace',
  buildId: string,
  previewMode: __ApiPreviewProps,
  config: NextConfigComplete,
  loadedEnvFiles: LoadedEnvFiles,
  pagesDir: string,
  isDev?: boolean
): Promise<Entrypoints> {
  const client: webpack5.EntryObject = {}
  const server: webpack5.EntryObject = {}
  const edgeServer: webpack5.EntryObject = {}

  const hasRuntimeConfig =
    Object.keys(config.publicRuntimeConfig).length > 0 ||
    Object.keys(config.serverRuntimeConfig).length > 0
  const hasReactRoot = !!config.experimental.reactRoot

  const defaultServerlessOptions = {
    absoluteAppPath: pages['/_app'],
    absoluteAppServerPath: pages['/_app.server'],
    absoluteDocumentPath: pages['/_document'],
    absoluteErrorPath: pages['/_error'],
    absolute404Path: pages['/404'] || '',
    distDir: DOT_NEXT_ALIAS,
    buildId,
    assetPrefix: config.assetPrefix,
    generateEtags: config.generateEtags ? 'true' : '',
    poweredByHeader: config.poweredByHeader ? 'true' : '',
    canonicalBase: config.amp.canonicalBase || '',
    basePath: config.basePath,
    runtimeConfig: hasRuntimeConfig
      ? JSON.stringify({
          publicRuntimeConfig: config.publicRuntimeConfig,
          serverRuntimeConfig: config.serverRuntimeConfig,
        })
      : '',
    previewProps: JSON.stringify(previewMode),
    // base64 encode to make sure contents don't break webpack URL loading
    loadedEnvFiles: Buffer.from(JSON.stringify(loadedEnvFiles)).toString(
      'base64'
    ),
    i18n: config.i18n ? JSON.stringify(config.i18n) : '',
    reactRoot: hasReactRoot ? 'true' : '',
  }

  await Promise.all(
    Object.keys(pages).map(async (page) => {
      const absolutePagePath = pages[page]
      const bundleFile = normalizePagePath(page)
      const isApiRoute = page.match(API_ROUTE)

      const clientBundlePath = posix.join('pages', bundleFile)
      const serverBundlePath = posix.join('pages', bundleFile)

      const isLikeServerless = isTargetLikeServerless(target)
      const isReserved = isReservedPage(page)
      const isCustomError = isCustomErrorPage(page)
      const isFlight = isFlightPage(config, absolutePagePath)
      const isInternalPages = !absolutePagePath.startsWith(PAGES_DIR_ALIAS)
      const pageFilePath = isInternalPages
        ? require.resolve(absolutePagePath)
        : join(pagesDir, absolutePagePath.replace(PAGES_DIR_ALIAS, ''))
      const pageRuntime = await getPageRuntime(pageFilePath, config, isDev)
      const isEdgeRuntime = pageRuntime === 'edge'

      if (page.match(MIDDLEWARE_ROUTE)) {
        const loaderOpts: MiddlewareLoaderOptions = {
          absolutePagePath: pages[page],
          page,
        }

        client[clientBundlePath] = `next-middleware-loader?${stringify(
          loaderOpts
        )}!`
        return
      }

      if (isEdgeRuntime && !isReserved && !isCustomError && !isApiRoute) {
        ssrEntries.set(clientBundlePath, { requireFlightManifest: isFlight })
        edgeServer[serverBundlePath] = finalizeEntrypoint({
          name: '[name].js',
          value: `next-middleware-ssr-loader?${stringify({
            dev: false,
            page,
            stringifiedConfig: JSON.stringify(config),
            absolute500Path: pages['/500'] || '',
            absolutePagePath,
            isServerComponent: isFlight,
            ...defaultServerlessOptions,
          } as any)}!`,
          isServer: false,
          isEdgeServer: true,
        })
      }

      if (isApiRoute && isLikeServerless) {
        const serverlessLoaderOptions: ServerlessLoaderQuery = {
          page,
          absolutePagePath,
          ...defaultServerlessOptions,
        }
        server[serverBundlePath] = `next-serverless-loader?${stringify(
          serverlessLoaderOptions
        )}!`
      } else if (isApiRoute || target === 'server') {
        if (!isEdgeRuntime || isReserved || isCustomError) {
          server[serverBundlePath] = [absolutePagePath]
        }
      } else if (
        isLikeServerless &&
        page !== '/_app' &&
        page !== '/_app.server' &&
        page !== '/_document' &&
        !isEdgeRuntime
      ) {
        const serverlessLoaderOptions: ServerlessLoaderQuery = {
          page,
          absolutePagePath,
          ...defaultServerlessOptions,
        }
        server[serverBundlePath] = `next-serverless-loader?${stringify(
          serverlessLoaderOptions
        )}!`
      }

      if (page === '/_document' || page === '/_app.server') {
        return
      }

      if (!isApiRoute) {
        const pageLoaderOpts: ClientPagesLoaderOptions = {
          page,
          absolutePagePath,
        }
        const pageLoader = `next-client-pages-loader?${stringify(
          pageLoaderOpts
        )}!`

        // Make sure next/router is a dependency of _app or else chunk splitting
        // might cause the router to not be able to load causing hydration
        // to fail

        client[clientBundlePath] =
          page === '/_app'
            ? [pageLoader, require.resolve('../client/router')]
            : pageLoader
      }
    })
  )

  return {
    client,
    server,
    edgeServer,
  }
}

export function finalizeEntrypoint({
  name,
  value,
  isServer,
  isMiddleware,
  isEdgeServer,
}: {
  isServer: boolean
  name: string
  value: ObjectValue<webpack5.EntryObject>
  isMiddleware?: boolean
  isEdgeServer?: boolean
}): ObjectValue<webpack5.EntryObject> {
  const entry =
    typeof value !== 'object' || Array.isArray(value)
      ? { import: value }
      : value

  if (isServer) {
    const isApi = name.startsWith('pages/api/')
    return {
      publicPath: isApi ? '' : undefined,
      runtime: isApi ? 'webpack-api-runtime' : 'webpack-runtime',
      layer: isApi ? 'api' : undefined,
      ...entry,
    }
  }

  if (isEdgeServer) {
    const ssrMiddlewareEntry = {
      library: {
        name: ['_ENTRIES', `middleware_[name]`],
        type: 'assign',
      },
      runtime: MIDDLEWARE_SSR_RUNTIME_WEBPACK,
      asyncChunks: false,
      ...entry,
    }
    return ssrMiddlewareEntry
  }
  if (isMiddleware) {
    const middlewareEntry = {
      filename: 'server/[name].js',
      layer: 'middleware',
      library: {
        name: ['_ENTRIES', `middleware_[name]`],
        type: 'assign',
      },
      runtime: MIDDLEWARE_RUNTIME_WEBPACK,
      asyncChunks: false,
      ...entry,
    }
    return middlewareEntry
  }

  if (
    name !== 'polyfills' &&
    name !== 'main' &&
    name !== 'amp' &&
    name !== 'react-refresh'
  ) {
    return {
      dependOn:
        name.startsWith('pages/') && name !== 'pages/_app'
          ? 'pages/_app'
          : 'main',
      ...entry,
    }
  }

  return entry
}
