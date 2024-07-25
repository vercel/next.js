import type { CustomRoutes } from '../lib/load-custom-routes'
import {} from '../server/dev/turbopack-utils'
import { getEntryKey } from '../server/dev/turbopack/entry-key'
import type { TurbopackManifestLoader } from '../server/dev/turbopack/manifest-loader'
import type { Entrypoints } from '../server/dev/turbopack/types'
import type { SetupOpts } from '../server/lib/router-utils/setup-dev-bundler'
import type { WrittenEndpoint } from './swc'

export async function handleRouteType({
  page,
  writtenEndpoint,
  routeType,
  entrypoints,
  manifestLoader,
  devRewrites,
  productionRewrites,
}: {
  page: string
  writtenEndpoint: WrittenEndpoint
  routeType: string
  entrypoints: Entrypoints
  manifestLoader: TurbopackManifestLoader
  devRewrites: SetupOpts['fsChecker']['rewrites'] | undefined
  productionRewrites: CustomRoutes['rewrites'] | undefined
}) {
  switch (routeType) {
    case 'page': {
      const serverKey = getEntryKey('pages', 'server', page)

      try {
        await manifestLoader.loadBuildManifest('_app')
        await manifestLoader.loadPagesManifest('_app')
        await manifestLoader.loadPagesManifest('_document')

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
        await manifestLoader.loadLoadableManifest(page, 'pages')

        await manifestLoader.writeManifests({
          devRewrites,
          productionRewrites,
          entrypoints,
        })
      } finally {
      }

      break
    }
    case 'page-api': {
      const key = getEntryKey('pages', 'server', page)

      const type = writtenEndpoint?.type

      await manifestLoader.loadPagesManifest(page)
      if (type === 'edge') {
        await manifestLoader.loadMiddlewareManifest(page, 'pages')
      } else {
        manifestLoader.deleteMiddlewareManifest(key)
      }
      await manifestLoader.loadLoadableManifest(page, 'pages')

      await manifestLoader.writeManifests({
        devRewrites,
        productionRewrites,
        entrypoints,
      })
      break
    }
    case 'app-page': {
      const key = getEntryKey('app', 'server', page)

      const type = writtenEndpoint?.type

      if (type === 'edge') {
        await manifestLoader.loadMiddlewareManifest(page, 'app')
      } else {
        manifestLoader.deleteMiddlewareManifest(key)
      }

      await manifestLoader.loadAppBuildManifest(page)
      await manifestLoader.loadBuildManifest(page, 'app')
      await manifestLoader.loadAppPathsManifest(page)
      await manifestLoader.loadActionManifest(page)
      await manifestLoader.loadLoadableManifest(page, 'app')
      await manifestLoader.loadFontManifest(page, 'app')
      await manifestLoader.writeManifests({
        devRewrites,
        productionRewrites,
        entrypoints,
      })

      break
    }
    case 'app-route': {
      const key = getEntryKey('app', 'server', page)

      const type = writtenEndpoint?.type

      await manifestLoader.loadAppPathsManifest(page)

      if (type === 'edge') {
        await manifestLoader.loadMiddlewareManifest(page, 'app')
      } else {
        manifestLoader.deleteMiddlewareManifest(key)
      }

      await manifestLoader.writeManifests({
        devRewrites,
        productionRewrites,
        entrypoints,
      })

      break
    }
    default: {
      throw new Error(`unknown route type ${routeType} for ${page}`)
    }
  }
}

export async function handlePagesErrorRoute({
  entrypoints,
  manifestLoader,
  devRewrites,
  productionRewrites,
}: {
  entrypoints: Entrypoints
  manifestLoader: TurbopackManifestLoader
  devRewrites: SetupOpts['fsChecker']['rewrites'] | undefined
  productionRewrites: CustomRoutes['rewrites'] | undefined
}) {
  await manifestLoader.loadBuildManifest('_app')
  await manifestLoader.loadPagesManifest('_app')
  await manifestLoader.loadFontManifest('_app')
  await manifestLoader.loadPagesManifest('_document')
  await manifestLoader.loadBuildManifest('_error')
  await manifestLoader.loadPagesManifest('_error')
  await manifestLoader.loadFontManifest('_error')

  await manifestLoader.writeManifests({
    devRewrites,
    productionRewrites,
    entrypoints,
  })
}
