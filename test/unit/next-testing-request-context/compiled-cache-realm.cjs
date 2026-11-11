const assert = require('node:assert/strict')
const {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  stat,
  rm,
} = require('node:fs/promises')
const { join, resolve } = require('node:path')
const { tmpdir } = require('node:os')
const { createRequire } = require('node:module')

async function advanceClock() {
  const before = Date.now()
  while (Date.now() <= before)
    await new Promise((resolve) => setImmediate(resolve))
}

async function run(load, scenario, mode) {
  assert.ok(['development', 'production'].includes(mode))
  if (mode === 'development') process.env.__NEXT_DEV_SERVER = 'true'
  else delete process.env.__NEXT_DEV_SERVER
  load('next/dist/server/node-environment-baseline')
  const { createCompiledFileCache, createCompiledFileCacheRealm } = load(
    'next/dist/experimental/testing/request/compiled-file-cache'
  )
  const { getCacheHandler, getCacheHandlers, registerCustomCacheHandlers } =
    load('next/dist/server/use-cache/handlers')
  const { tagsManifest } = load(
    'next/dist/server/lib/incremental-cache/tags-manifest.external'
  )
  const { CachedRouteKind, IncrementalCacheKind } = load(
    'next/dist/server/response-cache'
  )
  const root = await mkdtemp(join(tmpdir(), 'next-testing-cache-realm-'))
  const preview = {
    previewModeId: 'unit-id',
    previewModeEncryptionKey: 'unit-encryption',
    previewModeSigningKey: 'unit-signing',
  }
  const metadata = {
    mode,
    buildId: 'unit-build',
    deploymentId: '',
    incrementalCache: {
      cacheMaxMemorySize: 1024 * 1024,
      fetchCacheKeyPrefix: '',
      isrFlushToDisk: true,
      customHandlersConfigured: false,
    },
    renderOpts: {
      cacheLifeProfiles: {
        default: { stale: 300, revalidate: 900, expire: 3600 },
      },
      staticPageGenerationTimeout: 60,
      cacheComponents: false,
      validationLevel: 'warning',
      assetPrefix: '',
      experimental: {
        authInterrupts: false,
        useCacheTimeout: 50,
        durableUseCacheEntries: false,
      },
    },
  }
  const options = []
  for (const name of ['first', 'second']) {
    const directory = join(root, name)
    await mkdir(directory)
    const previewPropsPath = join(directory, 'preview.json'),
      prerenderManifestPath = join(directory, 'prerender.json')
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
    options.push({
      cacheScope: { type: 'file', directory },
      previewPropsPath,
      prerenderManifestPath,
    })
  }
  if (scenario === 'zero-memory')
    metadata.incrementalCache.cacheMaxMemorySize = 0
  let registrations = 0
  const registration = registerCustomCacheHandlers(async () => {
    registrations++
  })
  await registration
  assert.equal(registrations, 1)
  const registrationDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    Symbol.for('@next/custom-cache-handlers-registration')
  )
  const platformDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    Symbol.for('@next/cache-handlers')
  )
  const originalTags = [...tagsManifest]
  const keys = [
    'map',
    'set',
    'built-in',
    'private',
    'dev-fronts',
    'dev-tiered',
    'memory-disabled',
  ].map((name) => Symbol.for('@next/cache-handlers-' + name))
  const baseline = keys.map((key) =>
    Object.getOwnPropertyDescriptor(globalThis, key)
  )
  let first, second
  const realm =
    scenario === 'isolated' ? undefined : createCompiledFileCacheRealm()
  const get = (cache) =>
    cache.get('same-key', {
      kind: IncrementalCacheKind.FETCH,
      tags: ['same-tag'],
    })
  const value = (body) => ({
    kind: CachedRouteKind.FETCH,
    data: { headers: {}, body, status: 200, url: 'https://example.test/unit' },
    revalidate: 3600,
  })
  try {
    if (scenario === 'refusals') {
      const custom = {
        ...metadata,
        incrementalCache: {
          ...metadata.incrementalCache,
          customHandlersConfigured: true,
        },
      }
      assert.throws(
        () => createCompiledFileCache(custom, options[0], realm),
        /custom cache handlers/
      )
      const key = Symbol.for('@next/cache-handlers'),
        value = { DefaultCache: {} }
      Object.defineProperty(globalThis, key, {
        configurable: true,
        enumerable: true,
        writable: true,
        value,
      })
      assert.throws(
        () => createCompiledFileCache(metadata, options[0], realm),
        /platform cache handlers/
      )
      assert.throws(
        () => realm.acquire(options[0].cacheScope.directory, 1024),
        /platform cache handlers/
      )
      assert.equal(Reflect.get(globalThis, key), value)
      if (platformDescriptor)
        Object.defineProperty(globalThis, key, platformDescriptor)
      else Reflect.deleteProperty(globalThis, key)
      // A partial foreign registry must not cause initializeCacheHandlers to
      // reuse a map merely because its set has not been installed.
      const mapKey = keys[0],
        partial = new Map()
      Object.defineProperty(globalThis, mapKey, {
        configurable: true,
        writable: true,
        value: partial,
      })
      assert.equal(getCacheHandlers(), undefined)
      assert.throws(
        () => createCompiledFileCache(metadata, options[0], realm),
        /fresh execution realm/
      )
      assert.equal(Reflect.get(globalThis, mapKey), partial)
      Reflect.deleteProperty(globalThis, mapKey)
      realm.dispose()
      assert.deepEqual(
        Object.getOwnPropertyDescriptor(
          globalThis,
          Symbol.for('@next/custom-cache-handlers-registration')
        ),
        registrationDescriptor
      )
      return {
        scenario,
        mode,
        actualNodeVersion: process.version,
        customAndPlatformRefused: true,
        registrationRetained: true,
      }
    }
    first = createCompiledFileCache(metadata, options[0], realm)
    const cache = first.createIncrementalCache({ cookie: 'visitor=first' })
    const nextRequest = first.createIncrementalCache({
      cookie: 'visitor=second',
    })
    assert.notEqual(cache, nextRequest)
    assert.equal(nextRequest.requestHeaders.cookie, 'visitor=second')
    assert.equal(cache.hasCustomCacheHandler, false)
    if (scenario === 'isolation') {
      await cache.set('same-key', value('first'), {
        fetchCache: true,
        tags: ['same-tag'],
      })
      assert.deepEqual((await get(nextRequest)).value, value('first'))
      const handler = getCacheHandler('default')
      const entry = {
        value: new ReadableStream({
          start(c) {
            c.enqueue(new TextEncoder().encode('first-use-cache'))
            c.close()
          },
        }),
        tags: ['same-tag'],
        stale: 60,
        timestamp: Date.now() - 100,
        expire: 3600,
        revalidate: 3600,
      }
      await handler.set('same-use-cache-key', Promise.resolve(entry))
      assert.equal(
        await new Response(
          (await handler.get('same-use-cache-key', [])).value
        ).text(),
        'first-use-cache'
      )
      await advanceClock()
      await cache.revalidateTag('same-tag')
      assert.equal(await get(nextRequest), null)
      assert.equal(await handler.get('same-use-cache-key', []), undefined)
      assert.ok((await handler.getExpiration(['same-tag'])) > 0)
      assert.deepEqual([...tagsManifest], originalTags)
      assert.equal(
        JSON.parse(
          await readFile(
            join(options[0].cacheScope.directory, 'cache/fetch-cache/same-key'),
            'utf8'
          )
        ).data.body,
        'first'
      )
      await first.dispose()
      assert.equal(getCacheHandlers(), undefined)
      second = createCompiledFileCache(metadata, options[1], realm)
      const other = second.createIncrementalCache({})
      assert.equal(await get(other), null)
      const otherHandler = getCacheHandler('default')
      assert.notEqual(handler, otherHandler)
      assert.equal(await otherHandler.get('same-use-cache-key', []), undefined)
      assert.equal(await otherHandler.getExpiration(['same-tag']), 0)
      await other.set('same-key', value('second'), {
        fetchCache: true,
        tags: ['same-tag'],
      })
      assert.deepEqual((await get(other)).value, value('second'))
      await advanceClock()
      await otherHandler.updateTags(['same-tag'])
      assert.equal(await get(other), null)
      assert.deepEqual([...tagsManifest], originalTags)
      await second.dispose()
      assert.ok((await stat(options[0].cacheScope.directory)).isDirectory())
      assert.ok((await stat(options[1].cacheScope.directory)).isDirectory())
      assert.throws(
        () => createCompiledFileCache(metadata, options[0], realm),
        /new file cache directory/
      )
    } else if (scenario === 'zero-memory') {
      await cache.set('same-key', value('zero-first'), {
        fetchCache: true,
        tags: ['same-tag'],
      })
      assert.deepEqual((await get(cache)).value, value('zero-first'))
      const handler = getCacheHandler('default')
      await advanceClock()
      await cache.revalidateTag('same-tag')
      assert.ok((await handler.getExpiration(['same-tag'])) >= 0)
      assert.equal(await get(cache), null)
      await first.dispose()
      second = createCompiledFileCache(metadata, options[1], realm)
      assert.equal(await get(second.createIncrementalCache({})), null)
      assert.equal(
        await getCacheHandler('default').getExpiration(['same-tag']),
        0
      )
      await second.dispose()
    } else if (scenario === 'lifecycle') {
      const { createRequestLifecycle } = load(
        'next/dist/experimental/testing/request/request-lifecycle'
      )
      const { createCompiledRequestResources } = load(
        'next/dist/experimental/testing/request/compiled-request'
      )
      const { runWithRenderRequest } = load(
        'next/dist/experimental/testing/request/request-context'
      )
      const { after } = load('next/dist/server/after/after')
      const events = []
      let release, started
      const gate = new Promise((resolve) => {
        release = resolve
      })
      const afterStarted = new Promise((resolve) => {
        started = resolve
      })
      const lifecycle = createRequestLifecycle()
      const resource = await createCompiledRequestResources(metadata, {
        page: '/page',
        url: new URL('https://example.test/'),
        headers: {},
        rootParams: {},
        incrementalCache: cache,
        lifecycle,
      })
      runWithRenderRequest(resource.inputs, resource.workContext, () => {
        after(async () => {
          events.push('after-enter')
          started()
          await gate
          await cache.set('after-key', value('after'), { fetchCache: true })
          events.push('after-exit')
        })
      })
      const closing = resource.close().finally(async () => {
        await first.dispose()
        events.push('released')
      })
      await afterStarted
      assert.deepEqual(events, ['after-enter'])
      assert.throws(
        () => createCompiledFileCache(metadata, options[1], realm),
        /fresh execution realm|released file lease/
      )
      assert.throws(() => realm.dispose(), /active file lease/)
      release()
      await closing
      assert.deepEqual(events, ['after-enter', 'after-exit', 'released'])
      assert.equal(
        JSON.parse(
          await readFile(
            join(
              options[0].cacheScope.directory,
              'cache/fetch-cache/after-key'
            ),
            'utf8'
          )
        ).data.body,
        'after'
      )
      second = createCompiledFileCache(metadata, options[1], realm)
      assert.equal(
        await second
          .createIncrementalCache({})
          .get('after-key', { kind: IncrementalCacheKind.FETCH }),
        null
      )
      await second.dispose()
    } else if (scenario === 'ownership') {
      const key = keys[0],
        owned = Object.getOwnPropertyDescriptor(globalThis, key)
      const foreign = new Map()
      Object.defineProperty(globalThis, key, { ...owned, value: foreign })
      await assert.rejects(first.dispose(), /ownership changed/)
      assert.equal(Reflect.get(globalThis, key), foreign)
      assert.throws(
        () => realm.acquire(options[1].cacheScope.directory, 1024),
        /released file lease/
      )
      assert.throws(() => realm.dispose(), /active file lease/)
      // The helper owns this intentional replacement and restores the precise
      // captured descriptor so its own cleanup can release the original lease.
      Object.defineProperty(globalThis, key, owned)
      await first.dispose()
      assert.throws(
        () => realm.acquire(options[1].cacheScope.directory, 1024),
        /released file lease/
      )
    } else {
      assert.equal(scenario, 'isolated')
      await first.dispose()
      assert.throws(() => first.createIncrementalCache({}), /disposed/)
      assert.notEqual(getCacheHandlers(), undefined)
      assert.throws(
        () => createCompiledFileCache(metadata, options[1]),
        /fresh execution realm/
      )
    }
    if (realm) {
      await first.dispose()
      await second?.dispose()
      realm.dispose()
      for (let index = 0; index < keys.length; index++)
        assert.deepEqual(
          Object.getOwnPropertyDescriptor(globalThis, keys[index]),
          baseline[index]
        )
      assert.throws(
        () => realm.acquire(join(root, 'closed'), 1024),
        /released file lease/
      )
    }
    assert.deepEqual(
      Object.getOwnPropertyDescriptor(
        globalThis,
        Symbol.for('@next/custom-cache-handlers-registration')
      ),
      registrationDescriptor
    )
    assert.deepEqual(
      Object.getOwnPropertyDescriptor(
        globalThis,
        Symbol.for('@next/cache-handlers')
      ),
      platformDescriptor
    )
    return {
      scenario,
      mode,
      actualNodeVersion: process.version,
      realHandlers: true,
      separateFileState: true,
      defaultIsolatedGuardPreserved: true,
    }
  } finally {
    await first?.dispose()
    await second?.dispose()
    await rm(root, { recursive: true, force: true })
  }
}
module.exports = { run }
if (require.main === module)
  run(
    createRequire(join(resolve(process.argv[2]), 'package.json')),
    process.argv[3],
    process.argv[4]
  )
    .then((value) => console.log(JSON.stringify(value)))
    .catch((error) => {
      console.error(error)
      process.exitCode = 1
    })
