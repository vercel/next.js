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
      case 'conflict':
        Log.info(`skipping ${pathname} (${route.type})`)
        break
      default:
        route satisfies never
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

      await manifestLoader.loadClientBuildManifest(page)
      await manifestLoader.loadBuildManifest(page)
      await manifestLoader.loadPagesManifest(page)

      const middlewareManifestWritten =
        await manifestLoader.loadMiddlewareManifest(page, 'pages')
      if (!middlewareManifestWritten) {
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

      await manifestLoader.loadPagesManifest(page)
      const middlewareManifestWritten =
        await manifestLoader.loadMiddlewareManifest(page, 'pages')
      if (!middlewareManifestWritten) {
        manifestLoader.deleteMiddlewareManifest(key)
      }

      break
    }
    case 'app-page': {
      const key = getEntryKey('app', 'server', page)

      const middlewareManifestWritten =
        await manifestLoader.loadMiddlewareManifest(page, 'app')
      if (!middlewareManifestWritten) {
        manifestLoader.deleteMiddlewareManifest(key)
      }

      manifestLoader.loadBuildManifest(page, 'app')
      manifestLoader.loadAppPathsManifest(page)
      manifestLoader.loadActionManifest(page)
      manifestLoader.loadFontManifest(page, 'app')

      if (shouldCreateWebpackStats) {
        manifestLoader.loadWebpackStats(page, 'app')
      }

      break
    }
    case 'app-route': {
      const key = getEntryKey('app', 'server', page)

      manifestLoader.loadAppPathsManifest(page)

      const middlewareManifestWritten = manifestLoader.loadMiddlewareManifest(
        page,
        'app'
      )

      if (!middlewareManifestWritten) {
        manifestLoader.deleteMiddlewareManifest(key)
      }

      break
    }
    default: {
      throw new Error(`unknown route type ${(route as any).type} for ${page}`)
    }
  }
}
