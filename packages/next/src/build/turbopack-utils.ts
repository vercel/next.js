import type { CustomRoutes } from '../lib/load-custom-routes'
import {
  processIssues,
  type EntryIssuesMap,
} from '../server/dev/turbopack-utils'
import { getEntryKey } from '../server/dev/turbopack/entry-key'
import type { TurbopackManifestLoader } from '../server/dev/turbopack/manifest-loader'
import type { Entrypoints } from '../server/dev/turbopack/types'
import type { SetupOpts } from '../server/lib/router-utils/setup-dev-bundler'
import type { WrittenEndpointWithIssues } from './swc'

export async function handleRouteType({
  page,
  writtenEndpoint,
  routeType,
  globalAppEndpoint,
  globalDocumentEndpoint,
  currentEntryIssues,
  entrypoints,
  manifestLoader,
  devRewrites,
  productionRewrites,
  logErrors,
}: {
  page: string
  writtenEndpoint: WrittenEndpointWithIssues
  routeType: string
  globalAppEndpoint: WrittenEndpointWithIssues
  globalDocumentEndpoint: WrittenEndpointWithIssues
  currentEntryIssues: EntryIssuesMap
  entrypoints: Entrypoints
  manifestLoader: TurbopackManifestLoader
  devRewrites: SetupOpts['fsChecker']['rewrites'] | undefined
  productionRewrites: CustomRoutes['rewrites'] | undefined
  logErrors: boolean
}) {
  switch (routeType) {
    case 'page': {
      const serverKey = getEntryKey('pages', 'server', page)

      try {
        if (entrypoints.global.app) {
          const key = getEntryKey('pages', 'server', '_app')

          processIssues(
            currentEntryIssues,
            key,
            globalAppEndpoint,
            false,
            logErrors
          )
        }
        await manifestLoader.loadBuildManifest('_app')
        await manifestLoader.loadPagesManifest('_app')

        if (entrypoints.global.document) {
          const key = getEntryKey('pages', 'server', '_document')

          processIssues(
            currentEntryIssues,
            key,
            globalDocumentEndpoint,
            false,
            logErrors
          )
        }
        await manifestLoader.loadPagesManifest('_document')

        const type = writtenEndpoint?.writtenEndpoint.type

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

        processIssues(
          currentEntryIssues,
          serverKey,
          writtenEndpoint,
          false,
          logErrors
        )
      } finally {
      }

      break
    }
    case 'page-api': {
      const key = getEntryKey('pages', 'server', page)

      const type = writtenEndpoint?.writtenEndpoint.type

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

      processIssues(currentEntryIssues, key, writtenEndpoint, true, logErrors)

      break
    }
    case 'app-page': {
      const key = getEntryKey('app', 'server', page)

      const type = writtenEndpoint?.writtenEndpoint.type

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

      processIssues(currentEntryIssues, key, writtenEndpoint, false, logErrors)

      break
    }
    case 'app-route': {
      const key = getEntryKey('app', 'server', page)

      const type = writtenEndpoint?.writtenEndpoint.type

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
      processIssues(currentEntryIssues, key, writtenEndpoint, true, logErrors)

      break
    }
    default: {
      throw new Error(`unknown route type ${routeType} for ${page}`)
    }
  }
}

export async function handlePagesErrorRoute({
  globalAppEndpoint,
  globalDocumentEndpoint,
  globalErrorEndpoint,
  currentEntryIssues,
  entrypoints,
  manifestLoader,
  devRewrites,
  productionRewrites,
  logErrors,
}: {
  globalAppEndpoint: WrittenEndpointWithIssues
  globalDocumentEndpoint: WrittenEndpointWithIssues
  globalErrorEndpoint: WrittenEndpointWithIssues
  currentEntryIssues: EntryIssuesMap
  entrypoints: Entrypoints
  manifestLoader: TurbopackManifestLoader
  devRewrites: SetupOpts['fsChecker']['rewrites'] | undefined
  productionRewrites: CustomRoutes['rewrites'] | undefined
  logErrors: boolean
}) {
  if (entrypoints.global.app) {
    const key = getEntryKey('pages', 'server', '_app')

    processIssues(currentEntryIssues, key, globalAppEndpoint, false, logErrors)
  }

  await manifestLoader.loadBuildManifest('_app')
  await manifestLoader.loadPagesManifest('_app')
  await manifestLoader.loadFontManifest('_app')

  if (entrypoints.global.document) {
    const key = getEntryKey('pages', 'server', '_document')

    processIssues(
      currentEntryIssues,
      key,
      globalDocumentEndpoint,
      false,
      logErrors
    )
  }

  await manifestLoader.loadPagesManifest('_document')

  if (entrypoints.global.error) {
    const key = getEntryKey('pages', 'server', '_error')

    processIssues(
      currentEntryIssues,
      key,
      globalErrorEndpoint,
      false,
      logErrors
    )
  }
  await manifestLoader.loadBuildManifest('_error')
  await manifestLoader.loadPagesManifest('_error')
  await manifestLoader.loadFontManifest('_error')

  await manifestLoader.writeManifests({
    devRewrites,
    productionRewrites,
    entrypoints,
  })
}
