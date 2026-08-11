import { AssetMapper, handleEntrypoints } from './turbopack-utils'
import { getEntryKey } from '../../shared/lib/turbopack/entry-key'
import type { TurbopackManifestLoader } from '../../shared/lib/turbopack/manifest-loader'

// Regression test for https://github.com/vercel/next.js/issues/97035
//
// When an App Router page is deleted during `next dev --turbopack`,
// `handleEntrypointsDevCleanup` must drop the deleted route's partial
// manifest (via `TurbopackManifestLoader.delete`) together with its asset
// mapping and change subscription. Otherwise the stale app-paths manifest
// keeps being merged into `app-paths-manifest.json` and can collide with a
// newly added optional catch-all route of the same specificity, producing a
// false "same specificity" error and 404s until the dev server is restarted.
//
// This file is a regular jest unit test. It is additionally structured so it
// can run under a bare TypeScript runner (`npx tsx <file>`) to verify the
// regression without the full monorepo jest setup: when `it` is not defined it
// executes the scenario directly and exits non-zero on failure.

const STALE_ROUTE = 'app/[locale]/project/page'

async function runScenario(): Promise<string[]> {
  const staleKey = getEntryKey('app', 'server', STALE_ROUTE)

  const deletedKeys: string[] = []
  const manifestLoader = {
    delete: (key: string) => {
      deletedKeys.push(key)
    },
    deleteMiddlewareManifest: () => {},
    writeManifests: () => {},
  } as unknown as TurbopackManifestLoader

  // Simulate a previous compile that produced asset paths + a change
  // subscription for a route that no longer exists in the latest entrypoints.
  const assetMapper = new AssetMapper()
  assetMapper.setPathsForKey(staleKey, ['static/chunks/1.js'])
  const changeSubscriptions = new Map([[staleKey, () => {}]])

  await handleEntrypoints({
    entrypoints: {
      routes: new Map(),
      pagesAppEndpoint: undefined,
      pagesDocumentEndpoint: undefined,
      pagesErrorEndpoint: undefined,
      instrumentation: null,
      middleware: null,
    } as any,
    currentEntrypoints: {
      app: new Map(),
      page: new Map(),
      global: {
        app: undefined,
        document: undefined,
        error: undefined,
        middleware: undefined,
        instrumentation: undefined,
      },
    } as any,
    currentEntryIssues: new Map(),
    manifestLoader,
    devRewrites: undefined,
    productionRewrites: undefined,
    logErrors: false,
    // The dev hooks harness is intentionally minimal; only the parts exercised
    // by the cleanup path (unsubscribeFromChanges) are ever invoked here.
    dev: {
      assetMapper,
      changeSubscriptions,
      clients: [],
      clientStates: new Map(),
      serverFields: {},
      hooks: {
        handleWrittenEndpoint: () => {},
        propagateServerField: async () => {},
        sendHmr: () => {},
        startBuilding: () => {},
        subscribeToChanges: () => {},
        unsubscribeFromChanges: async () => {},
        unsubscribeFromHmrEvents: () => {},
      },
    } as any,
  })

  return deletedKeys
}

function assertStaleManifestDeleted(deletedKeys: string[], staleKey: string) {
  if (!deletedKeys.includes(staleKey)) {
    throw new Error(
      `expected handleEntrypointsDevCleanup to call ` +
        `manifestLoader.delete(${staleKey}) for the deleted route; ` +
        `got ${JSON.stringify(deletedKeys)}`
    )
  }
}

if (typeof it === 'function') {
  it('drops the deleted route partial manifest from the manifest loader', async () => {
    const staleKey = getEntryKey('app', 'server', STALE_ROUTE)
    assertStaleManifestDeleted(await runScenario(), staleKey)
  })
} else {
  // Standalone run (used by the regression harness):
  //   npx tsx packages/next/src/server/dev/turbopack-utils.test.ts
  runScenario()
    .then((deletedKeys) => {
      assertStaleManifestDeleted(
        deletedKeys,
        getEntryKey('app', 'server', STALE_ROUTE)
      )
      console.log('PASS: deleted route partial manifest is dropped')
    })
    .catch((error) => {
      console.error('FAIL:', (error as Error).message)
      process.exit(1)
    })
}
