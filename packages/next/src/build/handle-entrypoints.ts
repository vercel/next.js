import type { CustomRoutes } from '../lib/load-custom-routes'
import type { TurbopackManifestLoader } from '../shared/lib/turbopack/manifest-loader'
import type {
  TurbopackResult,
  RawEntrypoints,
  Entrypoints,
  PageRoute,
  AppRoute,
} from './swc/types'
import * as Log from './output/log'
import { getEntryKey } from '../shared/lib/turbopack/entry-key'
import {
  processIssues,
  type EntryIssuesMap,
} from '../shared/lib/turbopack/utils'

export async function handleEntrypoints({
  entrypoints,
  currentEntrypoints,
  currentEntryIssues,
  manifestLoader,
  productionRewrites,
  logErrors,
}: {
  entrypoints: TurbopackResult<RawEntrypoints>
  currentEntrypoints: Entrypoints
  currentEntryIssues: EntryIssuesMap
  manifestLoader: TurbopackManifestLoader
  productionRewrites: CustomRoutes['rewrites'] | undefined
  logErrors: boolean
}) {
  currentEntrypoints.global.app = entrypoints.pagesAppEndpoint
  currentEntrypoints.global.document = entrypoints.pagesDocumentEndpoint
  currentEntrypoints.global.error = entrypoints.pagesErrorEndpoint

  currentEntrypoints.global.instrumentation = entrypoints.instrumentation

  currentEntrypoints.page.clear()
  currentEntrypoints.app.clear()

  for (const [pathname, route] of entrypoints.routes) {
    switch (route.type) {
      case 'page':
      case 'page-api':
        currentEntrypoints.page.set(pathname, route)
        break
      case 'app-page': {
        route.pages.forEach((page) => {
          currentEntrypoints.app.set(page.originalName, {
            type: 'app-page',
            ...page,
          })
        })
        break
      }
      case 'app-route': {
        currentEntrypoints.app.set(route.originalName, route)
        break
      }
      default:
        Log.info(`skipping ${pathname} (${route.type})`)
        break
    }
  }

  const { middleware, instrumentation } = entrypoints

  // We check for explicit true/false, since it's initialized to
  // undefined during the first loop (middlewareChanges event is
  // unnecessary during the first serve)
  if (currentEntrypoints.global.middleware && !middleware) {
    const key = getEntryKey('root', 'server', 'middleware')
    // Went from middleware to no middleware
    currentEntryIssues.delete(key)
  }

  currentEntrypoints.global.middleware = middleware

  if (instrumentation) {
    const processInstrumentation = async (
      name: string,
      prop: 'nodeJs' | 'edge'
    ) => {
      const key = getEntryKey('root', 'server', name)

      const writtenEndpoint = await instrumentation[prop].writeToDisk()
      processIssues(currentEntryIssues, key, writtenEndpoint, false, logErrors)
    }
    await processInstrumentation('instrumentation.nodeJs', 'nodeJs')
    await processInstrumentation('instrumentation.edge', 'edge')
    await manifestLoader.loadMiddlewareManifest(
      'instrumentation',
      'instrumentation'
    )
    await manifestLoader.writeManifests({
      devRewrites: undefined,
      productionRewrites,
      entrypoints: currentEntrypoints,
    })
  }

  if (middleware) {
    const key = getEntryKey('root', 'server', 'middleware')

    const endpoint = middleware.endpoint

    async function processMiddleware() {
      const writtenEndpoint = await endpoint.writeToDisk()
      processIssues(currentEntryIssues, key, writtenEndpoint, false, logErrors)
      await manifestLoader.loadMiddlewareManifest('middleware', 'middleware')
    }
    await processMiddleware()
  } else {
    manifestLoader.deleteMiddlewareManifest(
      getEntryKey('root', 'server', 'middleware')
    )
  }
}

export async function handlePagesErrorRoute({
  currentEntryIssues,
  entrypoints,
  manifestLoader,
  productionRewrites,
  logErrors,
}: {
  currentEntryIssues: EntryIssuesMap
  entrypoints: Entrypoints
  manifestLoader: TurbopackManifestLoader
  productionRewrites: CustomRoutes['rewrites'] | undefined
  logErrors: boolean
}) {
  if (entrypoints.global.app) {
    const key = getEntryKey('pages', 'server', '_app')
    const writtenEndpoint = await entrypoints.global.app.writeToDisk()
    processIssues(currentEntryIssues, key, writtenEndpoint, false, logErrors)
  }
  await manifestLoader.loadBuildManifest('_app')
  await manifestLoader.loadPagesManifest('_app')
  await manifestLoader.loadFontManifest('_app')

  if (entrypoints.global.document) {
    const key = getEntryKey('pages', 'server', '_document')
    const writtenEndpoint = await entrypoints.global.document.writeToDisk()
    processIssues(currentEntryIssues, key, writtenEndpoint, false, logErrors)
  }
  await manifestLoader.loadPagesManifest('_document')

  if (entrypoints.global.error) {
    const key = getEntryKey('pages', 'server', '_error')
    const writtenEndpoint = await entrypoints.global.error.writeToDisk()
    processIssues(currentEntryIssues, key, writtenEndpoint, false, logErrors)
  }

  await manifestLoader.loadBuildManifest('_error')
  await manifestLoader.loadPagesManifest('_error')
  await manifestLoader.loadFontManifest('_error')

  await manifestLoader.writeManifests({
    devRewrites: undefined,
    productionRewrites,
    entrypoints,
  })
}

export async function handleRouteType({
  page,
  route,
  currentEntryIssues,
  entrypoints,
  manifestLoader,
  productionRewrites,
  logErrors,
}: {
  page: string
  route: PageRoute | AppRoute

  currentEntryIssues: EntryIssuesMap
  entrypoints: Entrypoints
  manifestLoader: TurbopackManifestLoader
  productionRewrites: CustomRoutes['rewrites'] | undefined
  logErrors: boolean
}) {
  const shouldCreateWebpackStats = process.env.TURBOPACK_STATS != null

  switch (route.type) {
    case 'page': {
      const serverKey = getEntryKey('pages', 'server', page)

      if (entrypoints.global.app) {
        const key = getEntryKey('pages', 'server', '_app')

        const writtenEndpoint = await entrypoints.global.app.writeToDisk()
        processIssues(
          currentEntryIssues,
          key,
          writtenEndpoint,
          false,
          logErrors
        )
      }
      await manifestLoader.loadBuildManifest('_app')
      await manifestLoader.loadPagesManifest('_app')

      if (entrypoints.global.document) {
        const key = getEntryKey('pages', 'server', '_document')

        const writtenEndpoint = await entrypoints.global.document.writeToDisk()
        processIssues(
          currentEntryIssues,
          key,
          writtenEndpoint,
          false,
          logErrors
        )
      }
      await manifestLoader.loadPagesManifest('_document')

      const writtenEndpoint = await route.htmlEndpoint.writeToDisk()

      const type = writtenEndpoint?.type

      await manifestLoader.loadBuildManifest(page)
      await manifestLoader.loadPagesManifest(page)
      if (type === 'edge') {
        await manifestLoader.loadMiddlewareManifest(page, 'pages')
      } else {
        manifestLoader.deleteMiddlewareManifest(serverKey)
      }
      await manifestLoader.loadFontManifest('/_app', 'pages')
      await manifestLoader.loadFontManifest(page, 'pages')

      if (shouldCreateWebpackStats) {
        await manifestLoader.loadWebpackStats(page, 'pages')
      }

      await manifestLoader.writeManifests({
        devRewrites: undefined,
        productionRewrites,
        entrypoints,
      })

      processIssues(
        currentEntryIssues,
        serverKey,
        writtenEndpoint,
        false,
        logErrors
      )

      break
    }
    case 'page-api': {
      const key = getEntryKey('pages', 'server', page)

      const writtenEndpoint = await route.endpoint.writeToDisk()

      const type = writtenEndpoint.type

      await manifestLoader.loadPagesManifest(page)
      if (type === 'edge') {
        await manifestLoader.loadMiddlewareManifest(page, 'pages')
      } else {
        manifestLoader.deleteMiddlewareManifest(key)
      }

      await manifestLoader.writeManifests({
        devRewrites: undefined,
        productionRewrites,
        entrypoints,
      })

      processIssues(currentEntryIssues, key, writtenEndpoint, true, logErrors)

      break
    }
    case 'app-page': {
      const key = getEntryKey('app', 'server', page)
      const writtenEndpoint = await route.htmlEndpoint.writeToDisk()
      const type = writtenEndpoint.type

      if (type === 'edge') {
        await manifestLoader.loadMiddlewareManifest(page, 'app')
      } else {
        manifestLoader.deleteMiddlewareManifest(key)
      }

      await manifestLoader.loadAppBuildManifest(page)
      await manifestLoader.loadBuildManifest(page, 'app')
      await manifestLoader.loadAppPathsManifest(page)
      await manifestLoader.loadActionManifest(page)
      await manifestLoader.loadFontManifest(page, 'app')

      if (shouldCreateWebpackStats) {
        await manifestLoader.loadWebpackStats(page, 'app')
      }

      await manifestLoader.writeManifests({
        devRewrites: undefined,
        productionRewrites,
        entrypoints,
      })

      processIssues(currentEntryIssues, key, writtenEndpoint, false, logErrors)

      break
    }
    case 'app-route': {
      const key = getEntryKey('app', 'server', page)
      const writtenEndpoint = await route.endpoint.writeToDisk()
      const type = writtenEndpoint.type

      await manifestLoader.loadAppPathsManifest(page)

      if (type === 'edge') {
        await manifestLoader.loadMiddlewareManifest(page, 'app')
      } else {
        manifestLoader.deleteMiddlewareManifest(key)
      }

      await manifestLoader.writeManifests({
        devRewrites: undefined,
        productionRewrites,
        entrypoints,
      })
      processIssues(currentEntryIssues, key, writtenEndpoint, true, logErrors)

      break
    }
    default: {
      throw new Error(`unknown route type ${(route as any).type} for ${page}`)
    }
  }
}
