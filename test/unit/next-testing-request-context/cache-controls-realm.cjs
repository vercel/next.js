const assert = require('node:assert/strict')
const { mkdtemp, mkdir, writeFile, rm } = require('node:fs/promises')
const { join, resolve } = require('node:path')
const { tmpdir } = require('node:os')
const { createRequire } = require('node:module')

async function run(load) {
  load('next/dist/server/node-environment-baseline')
  const { createCompiledFileCache, createCompiledFileCacheRealm } = load(
    'next/dist/experimental/testing/request/compiled-file-cache'
  )
  const { CachedRouteKind, IncrementalCacheKind } = load(
    'next/dist/server/response-cache'
  )
  const { RouteKind } = load('next/dist/server/route-kind')
  const { getRouteCacheKey } = load('next/dist/server/lib/route-cache-key')
  const directory = await mkdtemp(
    join(tmpdir(), 'next-testing-cache-lifetimes-')
  )
  const preview = {
    previewModeId: 'unit-id',
    previewModeEncryptionKey: 'unit-encryption',
    previewModeSigningKey: 'unit-signing',
  }
  const metadata = {
    mode: 'production',
    incrementalCache: {
      cacheMaxMemorySize: 1024 * 1024,
      fetchCacheKeyPrefix: '',
      isrFlushToDisk: true,
      customHandlersConfigured: false,
    },
  }
  const realm = createCompiledFileCacheRealm(),
    files = []
  const options = async (name) => {
    const root = join(directory, name)
    await mkdir(root)
    const previewPropsPath = join(root, 'preview.json'),
      prerenderManifestPath = join(root, 'prerender.json')
    await writeFile(previewPropsPath, JSON.stringify(preview))
    await writeFile(
      prerenderManifestPath,
      JSON.stringify({
        version: 4,
        routes: {},
        dynamicRoutes: {},
        notFoundRoutes: [],
      })
    )
    return {
      cacheScope: { type: 'file', directory: root },
      previewPropsPath,
      prerenderManifestPath,
    }
  }
  const path = '/same-path',
    route = { kind: RouteKind.APP_ROUTE, sourceRoute: '/same-path/route' }
  const context = { kind: IncrementalCacheKind.APP_ROUTE, route }
  const response = (body) => ({
    kind: CachedRouteKind.APP_ROUTE,
    body: Buffer.from(body),
    headers: {},
    status: 200,
  })
  try {
    const first = createCompiledFileCache(
      metadata,
      await options('first'),
      realm
    )
    files.push(first)
    const firstRequest = first.createIncrementalCache({}),
      lifetime = { revalidate: 3600, expire: 7200 }
    await firstRequest.set(path, response('first'), {
      route,
      cacheControl: lifetime,
    })
    assert.deepEqual(
      (await first.createIncrementalCache({}).get(path, context)).cacheControl,
      lifetime
    )
    await first.dispose()
    const second = createCompiledFileCache(
      metadata,
      await options('second'),
      realm
    )
    files.push(second)
    const secondRequest = second.createIncrementalCache({})
    // Seed the actual file handler without supplying a runtime lifetime. A new
    // file must consult its own manifest instead of borrowing the first file's.
    await secondRequest.cacheHandler.set(
      getRouteCacheKey(path, route),
      response('second'),
      {}
    )
    const result = await secondRequest.get(path, context)
    assert.equal(result.value.body.toString(), 'second')
    assert.equal(result.cacheControl, undefined)
    await secondRequest.set(path, response('second-updated'), {
      route,
      cacheControl: { revalidate: 10, expire: 20 },
    })
    assert.deepEqual(
      (await second.createIncrementalCache({}).get(path, context)).cacheControl,
      { revalidate: 10, expire: 20 }
    )
    await second.dispose()
    realm.dispose()
    return {
      actualNodeVersion: process.version,
      mode: 'production',
      withinFileLifetimeShared: true,
      crossFileLifetimeMiss: true,
      realIncrementalCacheAndFileHandler: true,
    }
  } finally {
    for (const file of files) await file.dispose()
    await rm(directory, { recursive: true, force: true })
  }
}
module.exports = { run }
if (require.main === module)
  run(createRequire(join(resolve(process.argv[2]), 'package.json')))
    .then((value) => console.log(JSON.stringify(value)))
    .catch((error) => {
      console.error(error)
      process.exitCode = 1
    })
