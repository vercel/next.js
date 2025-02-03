import type { TurbopackManifestLoader } from '../shared/lib/turbopack/manifest-loader'
import type {
  Entrypoints,
  PageRoute,
  AppRoute,
  RawEntrypoints,
} from './swc/types'
import { getEntryKey } from '../shared/lib/turbopack/entry-key'
import * as Log from './output/log'

export async function rawEntrypointsToEntrypoints(
  entrypointsOp: RawEntrypoints
): Promise<Entrypoints> {
  const page = new Map()
  const app = new Map()

  for (const [pathname, route] of entrypointsOp.routes) {
    switch (route.type) {
      case 'page':
      case 'page-api':
        page.set(pathname, route)
        break
      case 'app-page': {
        for (const p of route.pages) {
          app.set(p.originalName, {
            type: 'app-page',
            ...p,
          })
        }
        break
      }
      case 'app-route': {
        app.set(route.originalName, route)
        break
      }
      default:
        Log.info(`skipping ${pathname} (${route.type})`)
        break
    }
  }

  return {
    global: {
      app: entrypointsOp.pagesAppEndpoint,
      document: entrypointsOp.pagesDocumentEndpoint,
      error: entrypointsOp.pagesErrorEndpoint,
      instrumentation: entrypointsOp.instrumentation,
      middleware: entrypointsOp.middleware,
    },
    page,
    app,
  }
}

export async function handleRouteType({
  page,
  route,
  manifestLoader,
}: {
  page: string
  route: PageRoute | AppRoute
  manifestLoader: TurbopackManifestLoader
}) {
  const shouldCreateWebpackStats = process.env.TURBOPACK_STATS != null

  switch (route.type) {
    case 'page': {
      const serverKey = getEntryKey('pages', 'server', page)

      const type = await route.htmlEndpoint.runtime()

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

      break
    }
    case 'page-api': {
      const key = getEntryKey('pages', 'server', page)

      const type = await route.endpoint.runtime()

      await manifestLoader.loadPagesManifest(page)
      if (type === 'edge') {
        await manifestLoader.loadMiddlewareManifest(page, 'pages')
      } else {
        manifestLoader.deleteMiddlewareManifest(key)
      }

      break
    }
    case 'app-page': {
      const key = getEntryKey('app', 'server', page)
      const type = await route.htmlEndpoint.runtime()

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

      break
    }
    case 'app-route': {
      const key = getEntryKey('app', 'server', page)
      const type = await route.endpoint.runtime()

      await manifestLoader.loadAppPathsManifest(page)

      if (type === 'edge') {
        await manifestLoader.loadMiddlewareManifest(page, 'app')
      } else {
        manifestLoader.deleteMiddlewareManifest(key)
      }

      break
    }
    default: {
      throw new Error(`unknown route type ${(route as any).type} for ${page}`)
    }
  }
}
