import 'next/dist/server/node-environment-baseline'
import type { IncomingHttpHeaders } from 'http'
import {
  NEXT_CACHE_REVALIDATED_TAGS_HEADER,
  NEXT_CACHE_REVALIDATE_TAG_TOKEN_HEADER,
  PRERENDER_REVALIDATE_HEADER,
} from 'next/dist/lib/constants'
import { mkdtemp, writeFile, readFile, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { tagsManifest } from 'next/dist/server/lib/incremental-cache/tags-manifest.external'
import { createCompiledFileCache } from 'next/dist/experimental/testing/request/compiled-file-cache'
import { createCompiledRequestResources } from 'next/dist/experimental/testing/request/compiled-request'
import {
  CachedRouteKind,
  IncrementalCacheKind,
} from 'next/dist/server/response-cache'
import { runWithRenderRequest } from 'next/dist/experimental/testing/request/request-context'
import {
  createRequestLifecycle,
  RequestLifecycleError,
} from 'next/dist/experimental/testing/request/request-lifecycle'
import { createCompiledRequestWorkContext } from 'next/dist/experimental/testing/request/compiled-context'
import { nodeFs } from 'next/dist/server/lib/node-fs-methods'
import { IncrementalCache } from 'next/dist/server/lib/incremental-cache'
import { after } from 'next/dist/server/after/after'
import { cookies } from 'next/dist/server/request/cookies'
import { headers } from 'next/dist/server/request/headers'
import { workAsyncStorage } from 'next/dist/server/app-render/work-async-storage.external'
import { workUnitAsyncStorage } from 'next/dist/server/app-render/work-unit-async-storage.external'

type Inputs = Parameters<typeof runWithRenderRequest>[0]
type Context = Parameters<typeof runWithRenderRequest>[1]

function inputs(visitor: string): Inputs {
  return {
    headers: { cookie: `visitor=${visitor}`, 'accept-language': visitor },
    url: { pathname: '/', search: `?visitor=${visitor}` },
    onUpdateCookies: undefined,
    rootParams: {},
    implicitTags: { tags: [], expirationsByCacheKind: new Map() },
    resumeDataCache: null,
    previewProps: undefined,
    isHmrRefresh: false,
    serverComponentsHmrCache: undefined,
    hmrRefreshHash: undefined,
    fallbackParams: null,
  }
}

function context(): Context {
  return {
    page: '/page',
    buildId: 'test-build',
    deploymentId: '',
    previouslyRevalidatedTags: [],
    renderOpts: {
      cacheLifeProfiles: {
        default: { stale: 300, revalidate: 900, expire: 3600 },
      },
      staticPageGenerationTimeout: 60,
      cacheComponents: false,
      validationLevel: 'warning',
      experimental: {
        authInterrupts: false,
        useCacheTimeout: 50,
        durableUseCacheEntries: false,
      },
      isBuildTimePrerendering: false,
      isDraftMode: false,
      assetPrefix: '',
      waitUntil: undefined,
      onClose: () => {},
      onAfterTaskError: undefined,
    },
  }
}

describe('render request context', () => {
  it('keeps overlapping asynchronous requests separate using real request APIs', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const first = runWithRenderRequest(inputs('first'), context(), async () => {
      expect((await cookies()).get('visitor')?.value).toBe('first')
      await gate
      return [
        (await cookies()).get('visitor')?.value,
        (await headers()).get('accept-language'),
      ]
    })
    const second = runWithRenderRequest(
      inputs('second'),
      context(),
      async () => {
        try {
          expect((await cookies()).get('visitor')?.value).toBe('second')
          expect((await headers()).get('accept-language')).toBe('second')
        } finally {
          release()
        }
      }
    )
    await expect(first).resolves.toEqual(['first', 'first'])
    await second
    expect(workAsyncStorage.getStore()).toBeUndefined()
    expect(workUnitAsyncStorage.getStore()).toBeUndefined()
  })

  it('rejects render mutations even if a caller supplies an action phase at runtime', async () => {
    const untrustedPhase = { ...inputs('first'), phase: 'action' }
    await runWithRenderRequest(untrustedPhase, context(), async () => {
      const requestCookies = await cookies()
      const requestHeaders = await headers()
      expect(() => requestCookies.set('visitor', 'changed')).toThrow()
      expect(() => requestHeaders.set('accept-language', 'changed')).toThrow()
      expect(workUnitAsyncStorage.getStore()?.phase).toBe('render')
    })
  })

  it.each(['both', 'work', 'request'] as const)(
    'rejects nested entry with an active %s scope',
    async (scope) => {
      await runWithRenderRequest(inputs('outer'), context(), async () => {
        const render = jest.fn()
        const enter = () => {
          expect(() =>
            runWithRenderRequest(inputs('inner'), context(), render)
          ).toThrow(/outside an existing Next.js request or work scope/)
          expect(render).not.toHaveBeenCalled()
        }
        if (scope === 'work') {
          workUnitAsyncStorage.exit(enter)
        } else if (scope === 'request') {
          workAsyncStorage.exit(enter)
        } else {
          enter()
        }
        expect((await cookies()).get('visitor')?.value).toBe('outer')
      })
    }
  )

  it('captures a snapshot without the render request or work store', () => {
    runWithRenderRequest(inputs('first'), context(), () => {
      const workStore = workAsyncStorage.getStore()!
      expect(workUnitAsyncStorage.getStore()).toBeDefined()
      workStore.runInCleanSnapshot(() => {
        expect(workAsyncStorage.getStore()).toBeUndefined()
        expect(workUnitAsyncStorage.getStore()).toBeUndefined()
      })
      expect(workAsyncStorage.getStore()).toBe(workStore)
      expect(workUnitAsyncStorage.getStore()).toBeDefined()
    })
  })

  it('leaves no request scope after asynchronous failure', async () => {
    await expect(
      runWithRenderRequest(inputs('failed'), context(), async () => {
        await cookies()
        throw new Error('render failed')
      })
    ).rejects.toThrow('render failed')
    expect(workAsyncStorage.getStore()).toBeUndefined()
    expect(workUnitAsyncStorage.getStore()).toBeUndefined()
    expect(() => cookies()).toThrow(/outside a request scope/)
    await runWithRenderRequest(inputs('next'), context(), async () => {
      expect((await cookies()).get('visitor')?.value).toBe('next')
    })
  })
})

describe('request lifecycle', () => {
  it('runs after callbacks only on close and awaits nested delayed work', async () => {
    const lifecycle = createRequestLifecycle()
    const workContext = context()
    Object.assign(workContext.renderOpts, lifecycle.renderOpts)
    const events: string[] = []
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let started!: () => void
    const callbackStarted = new Promise<void>((resolve) => {
      started = resolve
    })
    runWithRenderRequest(inputs('first'), workContext, () => {
      after(async () => {
        events.push('after')
        expect(workUnitAsyncStorage.getStore()?.phase).toBe('after')
        started()
        await gate
        after(() => {
          events.push('nested')
        })
        events.push('released')
      })
    })
    expect(events).toEqual([])
    const closing = lifecycle.close()
    expect(lifecycle.close()).toBe(closing)
    let closed = false
    void closing.then(() => {
      closed = true
    })
    await callbackStarted
    expect(closed).toBe(false)
    release()
    await closing
    expect(events).toEqual(
      expect.arrayContaining(['after', 'released', 'nested'])
    )
    await lifecycle.close()
    expect(events).toHaveLength(3)
  })

  it('retains early after and waitUntil errors and drains remaining work', async () => {
    const lifecycle = createRequestLifecycle()
    const workContext = context()
    Object.assign(workContext.renderOpts, lifecycle.renderOpts)
    const promiseError = new Error('early after failure')
    const callbackError = new Error('callback failure')
    const waitError = new Error('waitUntil failure')
    const logged = jest.spyOn(console, 'error').mockImplementation(() => {})
    const events: string[] = []
    try {
      runWithRenderRequest(inputs('first'), workContext, () => {
        after(Promise.reject(promiseError))
        after(() => {
          throw callbackError
        })
        after(() => {
          events.push('drained')
        })
      })
      lifecycle.renderOpts.waitUntil!(Promise.reject(waitError))
      // Let early rejections settle before close, without producing an
      // unhandled rejection or dropping them from the final result.
      await new Promise<void>((resolve) => setImmediate(resolve))
      const closing = lifecycle.close()
      await expect(closing).rejects.toMatchObject({
        errors: expect.arrayContaining([
          promiseError,
          callbackError,
          waitError,
        ]),
      })
      expect(events).toEqual(['drained'])
      expect(lifecycle.close()).toBe(closing)
      await expect(lifecycle.close()).rejects.toBeInstanceOf(
        RequestLifecycleError
      )
    } finally {
      logged.mockRestore()
    }
  })

  it('drains after work when the caller closes following abort and render failure', async () => {
    const lifecycle = createRequestLifecycle()
    const workContext = context()
    Object.assign(workContext.renderOpts, lifecycle.renderOpts)
    const controller = new AbortController()
    const events: string[] = []
    await expect(
      runWithRenderRequest(inputs('first'), workContext, async () => {
        after(() => {
          events.push('after abort')
        })
        controller.abort(new Error('render aborted'))
        controller.signal.throwIfAborted()
      })
    ).rejects.toThrow('render aborted')
    expect(events).toEqual([])
    await lifecycle.close()
    expect(events).toEqual(['after abort'])
    expect(workAsyncStorage.getStore()).toBeUndefined()
    expect(workUnitAsyncStorage.getStore()).toBeUndefined()
  })

  it('recursively awaits waitUntil work and rejects registrations after draining', async () => {
    const lifecycle = createRequestLifecycle()
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let registered!: () => void
    const nestedRegistered = new Promise<void>((resolve) => {
      registered = resolve
    })
    let finished = false
    lifecycle.renderOpts.waitUntil!(
      Promise.resolve().then(() => {
        lifecycle.renderOpts.waitUntil!(
          gate.then(() => {
            finished = true
          })
        )
        registered()
      })
    )
    const closing = lifecycle.close()
    await nestedRegistered
    expect(finished).toBe(false)
    release()
    await closing
    expect(finished).toBe(true)
    expect(() => lifecycle.renderOpts.waitUntil!(Promise.resolve())).toThrow(
      /already awaited/
    )
  })
})

describe('compiled request configuration', () => {
  function cache(dev = true, requestHeaders: IncomingHttpHeaders = {}) {
    const preview = {
      previewModeId: 'unit-preview-id',
      previewModeEncryptionKey: 'unit-preview-encryption',
      previewModeSigningKey: 'unit-preview-signing',
    }
    return new IncrementalCache({
      fs: nodeFs,
      serverDistDir: '/tmp/next-testing-request-context-unit/server',
      maxMemoryCacheSize: 0,
      dev,
      minimalMode: false,
      requestHeaders,
      previewProps: preview,
      prerenderManifest: {
        version: 4,
        routes: {},
        dynamicRoutes: {},
        notFoundRoutes: [],
        preview,
      },
    })
  }

  function metadata(mode: 'development' | 'production' = 'development') {
    const resolved = context()
    return {
      mode,
      buildId: 'compiled-build',
      deploymentId: 'compiled-deployment',
      incrementalCache: {
        cacheMaxMemorySize: 1024 * 1024,
        allowedRevalidateHeaderKeys: undefined,
        fetchCacheKeyPrefix: 'configured-prefix',
        isrFlushToDisk: true,
        customHandlersConfigured: false,
      },
      renderOpts: {
        cacheLifeProfiles: resolved.renderOpts.cacheLifeProfiles,
        staticPageGenerationTimeout: 123,
        cacheComponents: true,
        validationLevel: 'experimental-error' as const,
        assetPrefix: '/compiled-assets',
        experimental: {
          authInterrupts: true,
          useCacheTimeout: 321,
          durableUseCacheEntries: true,
        },
      },
    }
  }

  function runtime(incrementalCache = cache()) {
    const live = context()
    return {
      ...live,
      renderOpts: { ...live.renderOpts, incrementalCache },
    }
  }

  it('requires metadata and a real cache matching compiler mode', () => {
    expect(() =>
      createCompiledRequestWorkContext(undefined, runtime())
    ).toThrow(/resolved requestContext metadata/)
    const missing = runtime()
    delete missing.renderOpts.incrementalCache
    expect(() => createCompiledRequestWorkContext(metadata(), missing)).toThrow(
      /real runtime IncrementalCache/
    )
    expect(() =>
      createCompiledRequestWorkContext(metadata(), runtime(cache(false)))
    ).toThrow(/IncrementalCache matching its compiler mode/)
  })

  it('uses production cache semantics without enabling prerender or PPR', () => {
    const live = runtime(cache(false))
    const result = createCompiledRequestWorkContext(
      metadata('production'),
      live
    )
    expect(result.renderOpts.incrementalCache.dev).toBe(false)
    expect(result.buildId).toBe('compiled-build')
    expect(() =>
      createCompiledRequestWorkContext(metadata('production'), runtime())
    ).toThrow(/IncrementalCache matching its compiler mode/)
    live.renderOpts.isBuildTimePrerendering = true
    expect(() =>
      createCompiledRequestWorkContext(metadata('production'), live)
    ).toThrow(/prerendering/)
    live.renderOpts.isBuildTimePrerendering = false
    live.renderOpts.experimental.isRoutePPREnabled = true
    expect(() =>
      createCompiledRequestWorkContext(metadata('production'), live)
    ).toThrow(/route PPR/)
  })

  it('keeps compiler settings authoritative and preserves live resources', () => {
    const compiled = metadata()
    const live = runtime()
    const result = createCompiledRequestWorkContext(compiled, live)
    expect(result.buildId).toBe('compiled-build')
    expect(result.deploymentId).toBe('compiled-deployment')
    expect(result.renderOpts).toMatchObject(compiled.renderOpts)
    expect(result.renderOpts.incrementalCache).toBe(
      live.renderOpts.incrementalCache
    )
    expect(result.renderOpts.onClose).toBe(live.renderOpts.onClose)
    expect(result.page).toBe(live.page)
    expect(live.renderOpts.cacheComponents).toBe(false)
  })

  it('rejects prerender and route PPR instead of treating them as dynamic requests', () => {
    const live = runtime()
    live.renderOpts.isBuildTimePrerendering = true
    expect(() => createCompiledRequestWorkContext(metadata(), live)).toThrow(
      /prerendering/
    )
    live.renderOpts.isBuildTimePrerendering = false
    live.renderOpts.experimental.isRoutePPREnabled = true
    expect(() => createCompiledRequestWorkContext(metadata(), live)).toThrow(
      /route PPR/
    )
  })

  it('rejects missing cache metadata and custom or non-file cache scopes', () => {
    const options = {
      cacheScope: {
        type: 'file' as const,
        directory: '/tmp/unused-file-cache',
      },
      previewPropsPath: '/tmp/unused-preview',
      prerenderManifestPath: '/tmp/unused-prerender',
    }
    expect(() => createCompiledFileCache(undefined, options)).toThrow(
      /resolved cache metadata/
    )
    expect(() =>
      createCompiledFileCache(metadata(), {
        ...options,
        cacheScope: { type: 'file', directory: 'relative' },
      })
    ).toThrow(/explicit file cache lease/)
    const custom = metadata()
    custom.incrementalCache.customHandlersConfigured = true
    expect(() => createCompiledFileCache(custom, options)).toThrow(
      /custom cache handlers/
    )
  })

  it('does not expose malformed preview manifest contents in errors', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'next-testing-invalid-manifest-')
    )
    const previewPropsPath = join(directory, 'preview-props.json')
    try {
      await writeFile(previewPropsPath, 'unit-preview-value-do-not-echo')
      expect(() =>
        createCompiledFileCache(metadata(), {
          cacheScope: { type: 'file', directory },
          previewPropsPath,
          prerenderManifestPath: join(directory, 'prerender-manifest.json'),
        })
      ).toThrow(
        `Unable to load compiled preview manifest at ${previewPropsPath}.`
      )
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it.each([
    ['matching', 'unit-preview-id', true],
    ['wrong', 'wrong-unit-token', undefined],
    ['missing', undefined, undefined],
  ] as const)(
    'preserves the %s on-demand revalidation flag',
    async (_, token, expected) => {
      const requestHeaders = { [PRERENDER_REVALIDATE_HEADER]: token }
      const incrementalCache = cache(true, requestHeaders)
      const lifecycle = createRequestLifecycle()
      try {
        const resource = await createCompiledRequestResources(metadata(), {
          page: '/__next_test__/entry/page',
          url: new URL('https://example.test/'),
          headers: requestHeaders,
          rootParams: {},
          incrementalCache,
          lifecycle,
        })
        runWithRenderRequest(resource.inputs, resource.workContext, () => {
          expect(workAsyncStorage.getStore()?.isOnDemandRevalidate).toBe(
            expected
          )
        })
      } finally {
        await lifecycle.close()
      }
    }
  )

  it('drains real cache work before after callbacks even after a write rejects', async () => {
    const lifecycle = createRequestLifecycle()
    const resource = await createCompiledRequestResources(metadata(), {
      page: '/__next_test__/entry/page',
      url: new URL('https://example.test/'),
      headers: {},
      rootParams: {},
      incrementalCache: cache(),
      lifecycle,
    })
    const cacheError = new Error('cache write failed')
    const afterError = new Error('after task failed')
    const events: string[] = []
    let release!: () => void
    const pendingWrite = new Promise<void>((resolve) => {
      release = resolve
    })
    const logged = jest.spyOn(console, 'error').mockImplementation(() => {})
    try {
      runWithRenderRequest(resource.inputs, resource.workContext, () => {
        const store = workAsyncStorage.getStore()!
        store.pendingRevalidates = { failed: Promise.reject(cacheError) }
        store.pendingRevalidateWrites = [
          pendingWrite.then(() => {
            events.push('write')
          }),
        ]
        store.pendingRevalidatedTags = [
          {
            tag: 'next-testing-drain',
            profile: { expire: 0 },
            revalidatedAt: performance.timeOrigin + performance.now(),
          },
        ]
        after(() => {
          events.push('after')
          throw afterError
        })
      })
      const closing = resource.close()
      expect(resource.close()).toBe(closing)
      let completed = false
      void closing.then(
        () => {
          completed = true
        },
        () => {
          completed = true
        }
      )
      await new Promise<void>((resolve) => setImmediate(resolve))
      expect(completed).toBe(false)
      expect(events).toEqual([])
      release()
      await expect(closing).rejects.toMatchObject({
        errors: [cacheError, afterError],
      })
      expect(events).toEqual(['write', 'after'])
      expect(tagsManifest.get('next-testing-drain')?.expired).toBeDefined()
      await expect(resource.close()).rejects.toMatchObject({
        errors: [cacheError, afterError],
      })
    } finally {
      release()
      await resource.close().catch(() => {})
      logged.mockRestore()
    }
  })

  it('settles cache writes registered by after callbacks after another revalidation rejects', async () => {
    const lifecycle = createRequestLifecycle()
    const resource = await createCompiledRequestResources(metadata(), {
      page: '/__next_test__/entry/page',
      url: new URL('https://example.test/'),
      headers: {},
      rootParams: {},
      incrementalCache: cache(),
      lifecycle,
    })
    const cacheError = new Error('after cache revalidation failed')
    const events: string[] = []
    let release!: () => void
    const pendingWrite = new Promise<void>((resolve) => {
      release = resolve
    })
    let started!: () => void
    const afterStarted = new Promise<void>((resolve) => {
      started = resolve
    })
    runWithRenderRequest(resource.inputs, resource.workContext, () => {
      after(() => {
        const store = workAsyncStorage.getStore()!
        store.pendingRevalidates = { failedAfter: Promise.reject(cacheError) }
        store.pendingRevalidateWrites = [
          pendingWrite.then(() => {
            events.push('write')
          }),
        ]
        events.push('after')
        started()
      })
    })
    const closing = resource.close()
    let completed = false
    void closing.then(
      () => {
        completed = true
      },
      () => {
        completed = true
      }
    )
    try {
      await afterStarted
      await new Promise<void>((resolve) => setImmediate(resolve))
      expect(completed).toBe(false)
      expect(events).toEqual(['after'])
      release()
      await expect(closing).rejects.toMatchObject({ errors: [cacheError] })
      expect(events).toEqual(['after', 'write'])
    } finally {
      release()
      await closing.catch(() => {})
    }
  })

  it('closes acquired resources when rendering never creates a work store', async () => {
    const lifecycle = createRequestLifecycle()
    const resource = await createCompiledRequestResources(metadata(), {
      page: '/__next_test__/entry/page',
      url: new URL('https://example.test/'),
      headers: {},
      rootParams: {},
      incrementalCache: cache(),
      lifecycle,
    })
    expect(
      Reflect.get(resource.workContext.renderOpts, 'store')
    ).toBeUndefined()
    await resource.close()
    expect(() => lifecycle.renderOpts.waitUntil!(Promise.resolve())).toThrow(
      /already awaited/
    )
  })

  it('validates revalidated tags per request outside minimal mode', async () => {
    const requests = [
      {
        name: 'first',
        token: 'unit-preview-id',
        tags: 'first-tag,shared',
        expected: ['first-tag', 'shared'],
      },
      {
        name: 'wrong-token',
        token: 'wrong-unit-token',
        tags: 'untrusted',
        expected: [],
      },
      {
        name: 'second',
        token: 'unit-preview-id',
        tags: 'second-tag',
        expected: ['second-tag'],
      },
      {
        name: 'missing-token',
        token: undefined,
        tags: 'untrusted',
        expected: [],
      },
    ]
    await Promise.all(
      requests.map(async ({ name, token, tags, expected }) => {
        const requestHeaders = {
          cookie: `visitor=${name}`,
          [NEXT_CACHE_REVALIDATED_TAGS_HEADER]: tags,
          [NEXT_CACHE_REVALIDATE_TAG_TOKEN_HEADER]: token,
        }
        const incrementalCache = cache(true, requestHeaders)
        expect(incrementalCache.minimalMode).toBe(false)
        expect(incrementalCache.revalidatedTags).toBeUndefined()
        const lifecycle = createRequestLifecycle()
        try {
          const resource = await createCompiledRequestResources(metadata(), {
            page: '/__next_test__/entry/page',
            url: new URL(`https://example.test/${name}`),
            headers: requestHeaders,
            rootParams: {},
            incrementalCache,
            lifecycle,
          })
          await runWithRenderRequest(
            resource.inputs,
            resource.workContext,
            async () => {
              expect((await cookies()).get('visitor')?.value).toBe(name)
              expect(
                workAsyncStorage.getStore()?.previouslyRevalidatedTags
              ).toEqual(expected)
            }
          )
        } finally {
          await lifecycle.close()
        }
      })
    )
  })

  it('shares real file cache data with fresh request headers and closes after failure', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'next-testing-file-cache-'))
    const previewPropsPath = join(directory, 'preview-props.json')
    const prerenderManifestPath = join(directory, 'prerender-manifest.json')
    // Synthetic inputs are local to this unit test; runtime loads A's real
    // development manifests, which carry actual generated preview keys.
    const preview = cache().previewProps
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
    const options = {
      cacheScope: { type: 'file' as const, directory },
      previewPropsPath,
      prerenderManifestPath,
    }
    const compiled = metadata()
    const fileCache = createCompiledFileCache(compiled, options)
    try {
      const firstHeaders = { cookie: 'visitor=first', 'accept-language': 'en' }
      const secondHeaders = {
        cookie: 'visitor=second',
        'accept-language': 'fr',
      }
      const first = fileCache.createIncrementalCache(firstHeaders)
      const second = fileCache.createIncrementalCache(secondHeaders)
      expect(first).not.toBe(second)
      expect(first.requestHeaders.cookie).toBe('visitor=first')
      expect(second.requestHeaders.cookie).toBe('visitor=second')
      expect(first.previewProps).toEqual(preview)
      expect(first.fetchCacheKeyPrefix).toBe('configured-prefix')
      const value = {
        kind: CachedRouteKind.FETCH as const,
        data: {
          headers: {},
          body: 'shared',
          status: 200,
          url: 'https://example.test/data',
        },
        revalidate: 3600,
      }
      await first.set('shared-key', value, { fetchCache: true })
      expect(
        (await second.get('shared-key', { kind: IncrementalCacheKind.FETCH }))
          ?.value
      ).toEqual(value)
      expect(
        JSON.parse(
          await readFile(
            join(directory, 'cache/fetch-cache/shared-key'),
            'utf8'
          )
        )
      ).toMatchObject(value)
      const bypass = fileCache.createIncrementalCache({
        'cache-control': 'no-cache',
      })
      expect(
        await bypass.get('shared-key', { kind: IncrementalCacheKind.FETCH })
      ).toBeNull()
      expect(
        (await second.get('shared-key', { kind: IncrementalCacheKind.FETCH }))
          ?.value
      ).toEqual(value)

      const lifecycles = [createRequestLifecycle(), createRequestLifecycle()]
      try {
        const requestResources = await Promise.all([
          createCompiledRequestResources(compiled, {
            page: '/__next_test__/entry/page',
            url: new URL('https://example.test/first?a=1'),
            headers: firstHeaders,
            rootParams: {},
            incrementalCache: first,
            lifecycle: lifecycles[0],
          }),
          createCompiledRequestResources(compiled, {
            page: '/__next_test__/entry/page',
            url: new URL('https://example.test/second?a=2'),
            headers: secondHeaders,
            rootParams: {},
            incrementalCache: second,
            lifecycle: lifecycles[1],
          }),
        ])
        const values = await Promise.all(
          requestResources.map(({ inputs, workContext }) =>
            runWithRenderRequest(inputs, workContext, async () => ({
              cookie: (await cookies()).get('visitor')?.value,
              language: (await headers()).get('accept-language'),
              url:
                workUnitAsyncStorage.getStore()?.type === 'request'
                  ? inputs.url
                  : null,
            }))
          )
        )
        expect(values).toEqual([
          {
            cookie: 'first',
            language: 'en',
            url: { pathname: '/first', search: '?a=1' },
          },
          {
            cookie: 'second',
            language: 'fr',
            url: { pathname: '/second', search: '?a=2' },
          },
        ])
        expect(requestResources[0].workContext.renderOpts.cacheComponents).toBe(
          true
        )
        expect(requestResources[0].inputs.implicitTags.tags).toContain(
          '_N_T_/first'
        )
      } finally {
        await Promise.all(lifecycles.map((lifecycle) => lifecycle.close()))
      }
      expect(() => createCompiledFileCache(compiled, options)).toThrow(
        /fresh execution realm/
      )
      await expect(
        (async () => {
          try {
            throw new Error('file failed')
          } finally {
            await fileCache.dispose()
          }
        })()
      ).rejects.toThrow('file failed')
      expect(() => fileCache.createIncrementalCache({})).toThrow(/disposed/)
      await fileCache.dispose()
    } finally {
      await fileCache.dispose()
      // Models the parent-owned lease cleanup; F never removes live file data.
      await rm(directory, { recursive: true, force: true })
    }
  })
})
