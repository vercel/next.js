import 'next/dist/server/node-environment-baseline'
import { validateFixtureProps } from 'next/dist/experimental/testing/rsc/fixture-data'
import { createCollector } from 'next/dist/experimental/testing/runner/collector'
import { runCollected } from 'next/dist/experimental/testing/runner/lifecycle'
import { getOriginatingAttempt } from 'next/dist/experimental/testing/runner/async-context'
import {
  initializeRscTesting,
  rsc,
  type RscTestingBindings,
} from 'next/dist/experimental/testing/rsc'

type AcquireRequest =
  typeof import('next/dist/experimental/testing/request/compiled-request').createCompiledRequestResources
let mockAcquireRequest: AcquireRequest | undefined
jest.mock('next/dist/experimental/testing/request/compiled-request', () => {
  const actual = jest.requireActual(
    'next/dist/experimental/testing/request/compiled-request'
  )
  return {
    ...actual,
    createCompiledRequestResources: (...args: Parameters<AcquireRequest>) =>
      mockAcquireRequest
        ? mockAcquireRequest(...args)
        : actual.createCompiledRequestResources(...args),
  }
})

// Gates run before invoking any renderer/cache resource. Actual emitted bridge
// rendering is tested separately with the compiler-produced artifact.
function bindings(): RscTestingBindings {
  return {
    ComponentMod: {} as RscTestingBindings['ComponentMod'],
    ConsumerMod: {
      decodeFlight: jest.fn(),
      createClientReferenceObserver: jest.fn(),
      observeServerTree: jest.fn(),
    },
    clientReferenceManifest:
      {} as RscTestingBindings['clientReferenceManifest'],
    manifestPage: '/__next_test__/fixture/page',
    profile: {
      id: 'rsc',
      environment: 'rsc',
      mode: 'development',
      bundler: 'turbopack',
      runtime: 'nodejs',
    },
    getActiveAttempt: () => ({
      signal: new AbortController().signal,
      onCleanup: jest.fn(),
    }),
  }
}

const Component = () => null
const options = { cacheScope: 'file' as const, url: 'http://localhost/' }

it.each([false, true])(
  'reports caught late renders from the original attempt (disposed: %s)',
  async (disposed) => {
    const input = bindings()
    input.getActiveAttempt = getOriginatingAttempt
    const runtime = initializeRscTesting(input)
    const collector = createCollector('late-rsc-file')
    const onLateFailure = jest.fn()
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    let deferred!: Promise<void>
    let caught: unknown
    collector.api.test('originating render attempt', () => {
      deferred = gate.then(async () => {
        try {
          await rsc.render(Component, {}, options)
        } catch (error) {
          caught = error
        }
      })
    })
    try {
      const result = await runCollected(
        collector.close(),
        {
          runId: 'late-rsc',
          signal: new AbortController().signal,
          onLateFailure,
        },
        () => {}
      )
      expect(result.cases[0].status).toBe('passed')
      if (disposed) await runtime.dispose()
      release()
      await deferred
      expect(onLateFailure).toHaveBeenCalledTimes(1)
      expect(onLateFailure).toHaveBeenCalledWith(caught)
      expect(String(caught)).toContain('closed attempt scope')
      expect(String(caught)).toContain('originating render attempt')
      expect(input.ConsumerMod.decodeFlight).not.toHaveBeenCalled()
      expect(
        input.ConsumerMod.createClientReferenceObserver
      ).not.toHaveBeenCalled()
    } finally {
      release()
      await deferred
      await runtime.dispose()
    }
  }
)

it('rejects host rendering outside an initialized emitted entry', async () => {
  await expect(rsc.render(Component, {}, options)).rejects.toThrow(
    'requires an emitted Next test entry'
  )
  await expect(rsc.renderRoute({ ...options, format: 'html' })).rejects.toThrow(
    'requires an emitted Next test entry'
  )
})

it('allows ordinary file initialization without request capabilities', async () => {
  const runtime = initializeRscTesting(bindings())
  try {
    await expect(rsc.render(Component, {}, options)).rejects.toThrow(
      'requires compiled requestContext metadata'
    )
  } finally {
    const disposal = runtime.dispose()
    expect(runtime.dispose()).toBe(disposal)
    await disposal
  }
  await expect(rsc.render(Component, {}, options)).rejects.toThrow(
    'requires an emitted Next test entry'
  )
})

it('does not create a second active bundle instance', async () => {
  const runtime = initializeRscTesting(bindings())
  try {
    expect(() => initializeRscTesting(bindings())).toThrow(
      'already initialized'
    )
  } finally {
    await runtime.dispose()
  }
})

it('rejects render calls outside a test attempt', async () => {
  const input = bindings()
  input.getActiveAttempt = () => undefined
  const runtime = initializeRscTesting(input)
  try {
    await expect(rsc.render(Component, {}, options)).rejects.toThrow(
      'requires an active test attempt'
    )
    await expect(
      rsc.renderRoute({ ...options, format: 'html' })
    ).rejects.toThrow('requires an active test attempt')
  } finally {
    await runtime.dispose()
  }
})

it.each([{ environment: 'node' as const }, { runtime: 'edge' as const }])(
  'rejects unsupported profile %j before rendering',
  async (profile) => {
    const input = bindings()
    Object.assign(input.profile, profile)
    const runtime = initializeRscTesting(input)
    try {
      await expect(rsc.render(Component, {}, options)).rejects.toThrow(
        'development or production Turbopack Node RSC subtree profiles'
      )
      expect(input.ConsumerMod.decodeFlight).not.toHaveBeenCalled()
    } finally {
      await runtime.dispose()
    }
  }
)

it('requires explicit file cache sharing and real manifest resources', async () => {
  const input = bindings()
  // Only existence is checked before the capability gates under test.
  input.requestContext = { mode: 'development' } as NonNullable<
    RscTestingBindings['requestContext']
  >
  const runtime = initializeRscTesting(input)
  try {
    await expect(
      rsc.render(Component, {}, { ...options, cacheScope: 'case' as 'file' })
    ).rejects.toThrow('requires explicit cacheScope: "file"')
    await expect(rsc.render(Component, {}, options)).rejects.toThrow(
      'requires a file cache lease and actual preview/prerender manifests'
    )
    expect(input.ConsumerMod.decodeFlight).not.toHaveBeenCalled()
  } finally {
    await runtime.dispose()
  }
})

it('rejects production rendering with development request metadata', async () => {
  const input = bindings()
  input.profile.mode = 'production'
  input.requestContext = { mode: 'development' } as NonNullable<
    RscTestingBindings['requestContext']
  >
  const runtime = initializeRscTesting(input)
  try {
    await expect(rsc.render(Component, {}, options)).rejects.toThrow(
      'request metadata matching its compiler profile'
    )
    expect(input.ConsumerMod.decodeFlight).not.toHaveBeenCalled()
  } finally {
    await runtime.dispose()
  }
})

describe('registered fixture data admission', () => {
  const { createRegisteredFixtureElement } =
    require('next/dist/experimental/testing/rsc/registered-fixture') as typeof import('next/dist/experimental/testing/rsc/registered-fixture')
  const { createElement, isValidElement } =
    require('react') as typeof import('react')

  it('retains async fixture execution in React and accepts nested JSON data', () => {
    const fixture = jest.fn(async () => createElement('p', null, 'fixture'))
    const shared = { text: 'server', enabled: true, count: 3, empty: null }
    const props = { items: [shared, shared] }
    const element = createRegisteredFixtureElement(
      createElement,
      fixture,
      props
    )
    expect(isValidElement(element)).toBe(true)
    expect(element.type).toBe(fixture)
    expect(element.props).toEqual(props)
    expect(fixture).not.toHaveBeenCalled()
  })

  it.each([
    undefined,
    null,
    [],
    { fn: () => null },
    { value: undefined },
    { value: NaN },
    { value: Infinity },
    { value: BigInt(1) },
    { value: Symbol('value') },
    { value: new Date() },
    { value: createElement('p') },
    { value: new Map() },
    { value: new Array(2) },
    { value: new (class extends Array {})() },
    { [Symbol('key')]: 1 },
    JSON.parse('{"__proto__":{"inherited":true}}'),
  ])('rejects invalid transport data at the server boundary (%#)', (props) => {
    expect(() => validateFixtureProps(props)).toThrow(
      /Registered fixture props/
    )
  })

  it('rejects cycles, hidden properties, array extras and deep data', () => {
    const cycle: Record<string, unknown> = {}
    cycle.self = cycle
    const extra = [1]
    Object.assign(extra, { extra: 2 })
    let deep = {}
    for (let i = 0; i < 102; i++) deep = { nested: deep }
    for (const props of [
      cycle,
      { extra },
      deep,
      Object.defineProperty({}, 'hidden', { value: 1 }),
    ]) {
      expect(() => validateFixtureProps(props)).toThrow(
        /Registered fixture props/
      )
    }
  })

  it('never invokes getters or toJSON while validating data', () => {
    const getter = jest.fn(() => 'secret')
    const toJSON = jest.fn(() => ({}))
    expect(() =>
      validateFixtureProps(
        Object.defineProperty({}, 'value', { enumerable: true, get: getter })
      )
    ).toThrow(/data properties/)
    expect(() => validateFixtureProps({ toJSON })).toThrow(/only JSON data/)
    expect(getter).not.toHaveBeenCalled()
    expect(toJSON).not.toHaveBeenCalled()
  })

  it('rejects proxies before serialization or navigation can invoke traps', () => {
    const toJSON = jest.fn(() => ({ changed: true }))
    const get = jest.fn((target, key) =>
      key === 'toJSON' ? toJSON : Reflect.get(target, key)
    )
    const getPrototypeOf = jest.fn(Reflect.getPrototypeOf)
    const proxy = new Proxy({}, { get, getPrototypeOf })
    const navigate = jest.fn()
    const mount = (props: unknown) => {
      validateFixtureProps(props)
      navigate(JSON.stringify(props))
    }
    for (const props of [proxy, { nested: proxy }, { nested: [proxy] }]) {
      expect(() => mount(props)).toThrow(/must not contain proxies/)
    }
    expect(get).not.toHaveBeenCalled()
    expect(getPrototypeOf).not.toHaveBeenCalled()
    expect(toJSON).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('rejects absent or noncomponent registered exports', () => {
    for (const fixture of [
      undefined,
      null,
      {},
      'path/to/module',
      createElement('p'),
    ]) {
      expect(() =>
        createRegisteredFixtureElement(createElement, fixture, {})
      ).toThrow(/export a component function/)
    }
  })
})

describe('registered App Page transport', () => {
  const { renderRegisteredFixturePage } =
    require('next/dist/experimental/testing/rsc/registered-fixture') as typeof import('next/dist/experimental/testing/rsc/registered-fixture')
  const { createElement } = require('react') as typeof import('react')

  it('uses only validated data and preserves the bound component inside the hydration root', async () => {
    const fixture = jest.fn(async () => createElement('p', null, 'server'))
    const root = await renderRegisteredFixturePage(
      createElement,
      fixture,
      Promise.resolve({
        __nextFixtureProps: JSON.stringify({ message: 'hello' }),
      })
    )
    expect(root.props.children).toMatchObject({
      type: fixture,
      props: { message: 'hello' },
    })
    expect(fixture).not.toHaveBeenCalled()
  })

  it.each([
    {},
    { __nextFixtureProps: ['{}', '{}'] },
    { __nextFixtureProps: '{sensitive-not-json' },
    { __nextFixtureProps: 'null' },
    { __nextFixtureProps: '[]' },
    { __nextFixtureProps: '{"value":1e999}' },
    { __nextFixtureProps: JSON.stringify({ text: 'é'.repeat(32768) }) },
  ])(
    'rejects missing, duplicate, invalid or oversized request data (%#)',
    async (query) => {
      const fixture = jest.fn()
      await expect(
        renderRegisteredFixturePage(
          createElement,
          fixture,
          Promise.resolve(query)
        )
      ).rejects.toThrow(/registered fixture|Registered fixture/)
      expect(fixture).not.toHaveBeenCalled()
    }
  )
})

describe('native AppProject request coherence', () => {
  const {
    validateCompiledTestRoute,
    resolveCompiledRouteRequest,
    createCompiledRouteRenderParams,
  } =
    require('next/dist/experimental/testing/rsc/route') as typeof import('next/dist/experimental/testing/rsc/route')
  const route = {
    version: 1 as const,
    pathname: '/[tenant]/reference/[...slug]',
    page: '/[tenant]/reference/[...slug]/page',
    runtime: 'nodejs' as const,
    basePath: '/base',
    rootParamNames: ['tenant'],
    config: {
      dynamic: 'auto' as const,
      dynamicParams: true,
      fetchCache: 'auto' as const,
      revalidate: false as const,
    },
    entry: { file: 'subject.test.ts', sha256: 'a'.repeat(64) },
    sources: [{ file: 'app/[tenant]/layout.jsx', sha256: 'b'.repeat(64) }],
  }
  const selected = { ...bindings().profile, route: route.pathname }
  it.each(
    (['development', 'production'] as const).flatMap((mode) =>
      (['request', 'render'] as const).flatMap((phase) =>
        (['cleanup', 'abort'] as const).map(
          (action) => [mode, phase, action] as const
        )
      )
    )
  )(
    'joins streaming %s late %s acquisition after %s with original cancellation ownership',
    async (mode, phase, action) => {
      const { renderCompiledRoute } =
        require('next/dist/experimental/testing/rsc/route-render') as typeof import('next/dist/experimental/testing/rsc/route-render')
      const RenderResult = require('next/dist/server/render-result')
        .default as typeof import('next/dist/server/render-result').default
      let entered!: () => void
      const acquiring = new Promise<void>((resolve) => {
        entered = resolve
      })
      let releaseRequest!: (value: Awaited<ReturnType<AcquireRequest>>) => void
      const pendingRequest = new Promise<Awaited<ReturnType<AcquireRequest>>>(
        (resolve) => {
          releaseRequest = resolve
        }
      )
      let releaseRender!: (value: InstanceType<typeof RenderResult>) => void
      const pendingRender = new Promise<InstanceType<typeof RenderResult>>(
        (resolve) => {
          releaseRender = resolve
        }
      )
      const closeRequest = jest.fn(async () => {})
      const resources = {
        inputs: {},
        workContext: { renderOpts: { experimental: {} } },
        close: closeRequest,
      } as unknown as Awaited<ReturnType<AcquireRequest>>
      const render = jest.fn(() => {
        entered()
        return pendingRender
      })
      const input = bindings()
      input.profile = { ...selected, mode }
      input.route = {
        ...route,
        config: { ...route.config, dynamic: 'force-dynamic' },
        metadataPath: 'server/next-test/route.json',
      }
      input.requestContext = {
        mode,
        renderOpts: { cacheComponents: false },
        routeRenderOpts: {},
      } as NonNullable<RscTestingBindings['requestContext']>
      input.routeRendering = {
        ComponentMod: {
          routeModule: {
            definition: { page: route.page, pathname: route.pathname },
            render,
          },
        },
      } as unknown as NonNullable<RscTestingBindings['routeRendering']>
      input.cacheScope = { type: 'file', directory: '/owned-cache' }
      const cleanups: Array<() => Promise<void>> = []
      const controller = new AbortController()
      const reason = new Error('original attempt cancellation')
      const cancelSource = jest.fn()
      let source: ReadableStream<Uint8Array> | undefined
      mockAcquireRequest = async () => {
        if (phase === 'request') {
          entered()
          return pendingRequest
        }
        return resources
      }
      const rendering = renderCompiledRoute(
        input,
        {
          signal: controller.signal,
          onCleanup: (cleanup) => cleanups.push(cleanup),
        },
        {
          ...options,
          format: 'html',
          url: 'http://localhost/base/acme/reference/x',
        },
        () =>
          ({ createIncrementalCache: () => ({}) }) as unknown as ReturnType<
            typeof import('next/dist/experimental/testing/request/compiled-file-cache').createCompiledFileCache
          >,
        () => {},
        true
      )
      void rendering.catch(() => {})
      try {
        await acquiring
        if (action === 'abort') controller.abort(reason)
        const closing = cleanups[0]()
        let closed = false
        void closing.then(
          () => {
            closed = true
          },
          () => {}
        )
        await Promise.resolve()
        expect(closed).toBe(false)
        if (phase === 'request') releaseRequest(resources)
        else {
          source = new ReadableStream({
            start(destination) {
              destination.enqueue(new TextEncoder().encode('late source'))
            },
            cancel: cancelSource,
          })
          releaseRender(
            new RenderResult(source, {
              metadata: {},
              contentType: 'text/html; charset=utf-8',
            })
          )
        }
        await closing
        const failure = await rendering.catch((error) => error)
        if (action === 'abort') expect(failure).toBe(reason)
        else
          expect(failure).toMatchObject({
            name: 'AbortError',
            message: 'Route stream disposed',
          })
        expect(closeRequest).toHaveBeenCalledTimes(1)
        if (phase === 'request') expect(render).not.toHaveBeenCalled()
        else {
          expect(cancelSource).toHaveBeenCalledTimes(1)
          expect(cancelSource.mock.calls[0][0]).toBe(failure)
        }
        await expect(cleanups[0]()).resolves.toBeUndefined()
      } finally {
        mockAcquireRequest = undefined
        releaseRequest(resources)
        if (phase === 'render' && !source) {
          releaseRender(
            new RenderResult(null, { metadata: {}, contentType: null })
          )
        }
        await Promise.allSettled([
          rendering,
          ...cleanups.map((cleanup) => cleanup()),
        ])
      }
    }
  )

  it.each(['attempt cleanup', 'file disposal'])(
    'closes resources acquired after %s has started',
    async (ending) => {
      const { renderCompiledRoute } =
        require('next/dist/experimental/testing/rsc/route-render') as typeof import('next/dist/experimental/testing/rsc/route-render')
      const RenderResult = require('next/dist/server/render-result')
        .default as typeof import('next/dist/server/render-result').default
      let release!: (value: Awaited<ReturnType<AcquireRequest>>) => void
      let started!: () => void
      const acquiring = new Promise<void>((resolve) => {
        started = resolve
      })
      const pending = new Promise<Awaited<ReturnType<AcquireRequest>>>(
        (resolve) => {
          release = resolve
        }
      )
      const closeRequest = jest.fn(async () => {})
      const resources = {
        inputs: {},
        workContext: { renderOpts: { experimental: {} } },
        close: closeRequest,
      } as unknown as Awaited<ReturnType<AcquireRequest>>
      const render = jest.fn(
        async () =>
          new RenderResult('unexpected render', {
            metadata: {},
            contentType: 'text/html; charset=utf-8',
          })
      )
      const input = bindings()
      input.profile = selected
      input.route = {
        ...route,
        config: { ...route.config, dynamic: 'force-dynamic' },
        metadataPath: 'server/next-test/route.json',
      }
      input.requestContext = {
        mode: selected.mode,
        renderOpts: { cacheComponents: false },
        routeRenderOpts: {},
      } as NonNullable<RscTestingBindings['requestContext']>
      input.routeRendering = {
        ComponentMod: {
          routeModule: {
            definition: { page: route.page, pathname: route.pathname },
            render,
          },
        },
      } as unknown as NonNullable<RscTestingBindings['routeRendering']>
      input.cacheScope = { type: 'file', directory: '/owned-cache' }
      const cleanups: Array<() => Promise<void>> = []
      let ownerClosed = false
      mockAcquireRequest = async () => {
        started()
        return pending
      }
      try {
        const rendering = renderCompiledRoute(
          input,
          {
            signal: new AbortController().signal,
            onCleanup: (cleanup) => cleanups.push(cleanup),
          },
          {
            ...options,
            format: 'html',
            url: 'http://localhost/base/acme/reference/x',
          },
          () =>
            ({ createIncrementalCache: () => ({}) }) as unknown as ReturnType<
              typeof import('next/dist/experimental/testing/request/compiled-file-cache').createCompiledFileCache
            >,
          () => {
            if (ownerClosed)
              throw new Error(
                'The RSC test lifetime ended while creating its route request.'
              )
          }
        )
        await acquiring
        if (ending === 'attempt cleanup') await cleanups[0]()
        else ownerClosed = true
        release(resources)
        await expect(rendering).rejects.toThrow(
          'lifetime ended while creating its route request'
        )
        expect(closeRequest).toHaveBeenCalledTimes(1)
        expect(render).not.toHaveBeenCalled()
      } finally {
        mockAcquireRequest = undefined
        release(resources)
      }
    }
  )
  it.each(['development', 'production'] as const)(
    'requires a live full-route entry and actual manifests in %s',
    async (mode) => {
      const input = bindings()
      input.profile = { ...selected, mode }
      input.route = { ...route, metadataPath: 'server/next-test/route.json' }
      const runtime = initializeRscTesting(input)
      try {
        await expect(
          rsc.renderRoute({ ...options, format: 'html' })
        ).rejects.toThrow(
          'matching compiled AppPage options, live entrypoint and manifests'
        )
        expect(input.ConsumerMod.decodeFlight).not.toHaveBeenCalled()
      } finally {
        await runtime.dispose()
      }
    }
  )
  it.each(['development', 'production'] as const)(
    'derives decoded params and actual loader-tree root params in %s with the normal route matcher',
    async (mode) => {
      expect(() =>
        validateCompiledTestRoute(route, { ...selected, mode })
      ).not.toThrow()
      await expect(
        resolveCompiledRouteRequest(
          route,
          new URL('http://localhost/base/acme/reference/a%20b/c'),
          Promise.resolve({ tenant: 'acme', slug: ['a b', 'c'] }),
          { tenant: 'acme' },
          new AbortController().signal
        )
      ).resolves.toEqual({
        params: { tenant: 'acme', slug: ['a b', 'c'] },
        rootParams: { tenant: 'acme' },
      })
    }
  )
  it.each([
    [
      'http://localhost/base/ac%20me/reference/a%20b/c',
      { tenant: 'ac me', slug: ['a b', 'c'] },
      { tenant: 'ac%20me', slug: ['a%20b', 'c'] },
    ],
    [
      'http://localhost/base/%E6%9D%B1%E4%BA%AC/reference/%e2%9c%93/%F0%9F%9A%80',
      { tenant: '東京', slug: ['✓', '🚀'] },
      { tenant: '%E6%9D%B1%E4%BA%AC', slug: ['%E2%9C%93', '%F0%9F%9A%80'] },
    ],
    [
      'http://localhost/base/acme/reference/%2520/%252F/a%2Fb',
      { tenant: 'acme', slug: ['%20', '%2F', 'a/b'] },
      { tenant: 'acme', slug: ['%2520', '%252F', 'a%2Fb'] },
    ],
  ] as const)(
    'derives app-render values after preserving decoded logical matching for %s',
    async (url, decoded, rendered) => {
      const logical = await resolveCompiledRouteRequest(
        route,
        new URL(url),
        Promise.resolve(decoded),
        { tenant: decoded.tenant },
        new AbortController().signal
      )
      expect(logical).toEqual({
        params: decoded,
        rootParams: { tenant: decoded.tenant },
      })
      expect(createCompiledRouteRenderParams(route, logical.params)).toEqual({
        params: rendered,
        rootParams: { tenant: rendered.tenant },
      })
      expect(logical.params).toEqual(decoded)
    }
  )
  it('omits absent optional catch-all values like the normal component tree', () => {
    const optional = {
      ...route,
      pathname: '/[tenant]/[[...slug]]',
      page: '/(group)/[tenant]/[[...slug]]/page',
    }
    expect(
      createCompiledRouteRenderParams(optional, { tenant: 'ac me' })
    ).toEqual({
      params: { tenant: 'ac%20me' },
      rootParams: { tenant: 'ac%20me' },
    })
  })
  it.each([
    ['file:///base/acme/reference/x', undefined, undefined, 'HTTP or HTTPS'],
    [
      'http://localhost/other/acme/reference/x',
      undefined,
      undefined,
      'URL does not match',
    ],
    [
      'http://localhost/base/acme/other/x',
      undefined,
      undefined,
      'URL does not match',
    ],
    [
      'http://localhost/base/acme/reference/x',
      { tenant: 'other', slug: ['x'] },
      undefined,
      'params do not match',
    ],
    [
      'http://localhost/base/acme/reference/x',
      { tenant: 'acme', slug: ['x'], extra: 'x' },
      undefined,
      'params do not match',
    ],
    [
      'http://localhost/base/acme/reference/x',
      undefined,
      { tenant: 'other' },
      'rootParams do not match',
    ],
    [
      'http://localhost/base/acme/reference/x',
      undefined,
      { tenant: 'acme', slug: ['x'] },
      'rootParams do not match',
    ],
  ])(
    'rejects incoherent request %s before rendering',
    async (url, params, rootParams, message) => {
      await expect(
        resolveCompiledRouteRequest(
          route,
          new URL(url as string),
          params,
          rootParams as Record<string, string> | undefined,
          new AbortController().signal
        )
      ).rejects.toThrow(message as string)
    }
  )
  it('cancels an unresolved supplied params promise', async () => {
    const controller = new AbortController()
    const result = resolveCompiledRouteRequest(
      route,
      new URL('http://localhost/base/acme/reference/x'),
      new Promise(() => {}),
      undefined,
      controller.signal
    )
    controller.abort(new Error('owned attempt cancelled'))
    await expect(result).rejects.toThrow('owned attempt cancelled')
  })
  it.each([
    { runtime: 'edge' },
    { pathname: '/other' },
    { page: '/wrong/page' },
    { rootParamNames: ['missing'] },
    { config: { ...route.config, dynamic: 'invented' } },
    { sources: [] },
  ])('rejects incoherent native metadata %j', (changes) => {
    expect(() =>
      validateCompiledTestRoute({ ...route, ...changes }, selected)
    ).toThrow()
  })
  it.each(['development', 'production'] as const)(
    'requires route facts for a configured %s route',
    async (mode) => {
      const input = bindings()
      input.profile.route = '/reference/[slug]'
      input.profile.mode = mode
      const runtime = initializeRscTesting(input)
      try {
        await expect(rsc.render(Component, {}, options)).rejects.toThrow(
          'matching native AppProject route metadata'
        )
      } finally {
        await runtime.dispose()
      }
    }
  )

  it.each(
    (['before', 'after'] as const).flatMap((phase) =>
      (['cleanup', 'abort'] as const).map((action) => [phase, action] as const)
    )
  )(
    'joins streaming %s debug callback acquisition during %s',
    async (phase, action) => {
      const { renderCompiledRoute } =
        require('next/dist/experimental/testing/rsc/route-render') as typeof import('next/dist/experimental/testing/rsc/route-render')
      const RenderResult = require('next/dist/server/render-result')
        .default as typeof import('next/dist/server/render-result').default
      const { createNodeDebugChannel } =
        require('next/dist/server/app-render/debug-channel-server.node') as typeof import('next/dist/server/app-render/debug-channel-server.node')
      const channel = createNodeDebugChannel()
      let entered!: () => void
      const ready = new Promise<void>((resolve) => (entered = resolve))
      let release!: () => void
      const gate = new Promise<void>((resolve) => (release = resolve))
      const closeRequest = jest.fn(async () => {})
      const resources = {
        inputs: {},
        workContext: { renderOpts: { experimental: {} } },
        close: closeRequest,
      } as unknown as Awaited<ReturnType<AcquireRequest>>
      mockAcquireRequest = async () => resources
      let callback: import('next/dist/server/app-render/types').RenderOpts['setReactDebugChannel']
      let renderSignal: AbortSignal | undefined
      const cancel = jest.fn(async (_reason: unknown) => {
        await new Promise<void>((resolve, reject) => {
          channel.serverSide.end((error: Error | undefined) =>
            error ? reject(error) : resolve()
          )
        })
      })
      const render = jest.fn(
        async (
          _request: unknown,
          _response: unknown,
          context: Parameters<
            NonNullable<
              RscTestingBindings['routeRendering']
            >['ComponentMod']['routeModule']['render']
          >[2]
        ) => {
          callback = context.renderOpts.setReactDebugChannel
          renderSignal = context.renderOpts.renderAbortSignal
          expect(renderSignal).toBeInstanceOf(AbortSignal)
          expect(renderSignal!.aborted).toBe(false)
          expect(typeof callback).toBe('function')
          if (phase === 'before') {
            entered()
            await gate
          }
          callback!(channel.clientSide, 'actual-html-id', 'actual-request-id')
          channel.serverSide.write(Buffer.from('actual debug bytes'))
          if (phase === 'after') {
            entered()
            await gate
          }
          return new RenderResult(new ReadableStream({ cancel }), {
            metadata: {},
            contentType: 'text/html; charset=utf-8',
          })
        }
      )
      const input = bindings()
      input.profile = { ...selected }
      input.route = {
        ...route,
        config: { ...route.config, dynamic: 'force-dynamic' },
        metadataPath: 'server/next-test/route.json',
      }
      input.requestContext = {
        mode: 'development',
        renderOpts: { cacheComponents: false },
        routeRenderOpts: { reactDebugChannel: true },
      } as NonNullable<RscTestingBindings['requestContext']>
      input.routeRendering = {
        ComponentMod: {
          routeModule: {
            definition: { page: route.page, pathname: route.pathname },
            render,
          },
        },
      } as unknown as NonNullable<RscTestingBindings['routeRendering']>
      input.cacheScope = { type: 'file', directory: '/owned-cache' }
      const cleanups: Array<() => Promise<void>> = []
      const controller = new AbortController()
      const reason = new Error('actual debug request attempt cancelled')
      const rendering = renderCompiledRoute(
        input,
        {
          signal: controller.signal,
          onCleanup: (cleanup) => cleanups.push(cleanup),
        },
        {
          ...options,
          format: 'html',
          url: 'http://localhost/base/acme/reference/x',
        },
        () =>
          ({ createIncrementalCache: () => ({}) }) as unknown as ReturnType<
            typeof import('next/dist/experimental/testing/request/compiled-file-cache').createCompiledFileCache
          >,
        () => {},
        true
      )
      void rendering.catch(() => {})
      try {
        await ready
        if (action === 'abort') controller.abort(reason)
        const closing = cleanups[0]()
        let closed = false
        void closing.then(
          () => {
            closed = true
          },
          () => {}
        )
        await Promise.resolve()
        expect(closed).toBe(false)
        release()
        await closing
        const actual = await rendering.catch((error) => error)
        expect(actual).toBe(cancel.mock.calls[0][0])
        if (action === 'abort') expect(actual).toBe(reason)
        else
          expect(actual).toMatchObject({
            name: 'AbortError',
            message: 'Route stream disposed',
          })
        expect(render).toHaveBeenCalledTimes(1)
        expect(cancel).toHaveBeenCalledTimes(1)
        expect(closeRequest).toHaveBeenCalledTimes(1)
        expect(renderSignal!.aborted).toBe(true)
        expect(renderSignal!.reason).toMatchObject({ name: 'ResponseAborted' })
        expect(channel.clientSide.readable.readableEnded).toBe(true)
        expect(channel.clientSide.readable.destroyed).toBe(true)
        await cleanups[0]()
        expect(closeRequest).toHaveBeenCalledTimes(1)
      } finally {
        release()
        await rendering.catch(() => {})
        mockAcquireRequest = undefined
      }
    }
  )

  it.each(['node', 'web'] as const)(
    'joins queued actual %s debug producer writes after main source cancellation',
    async (kind) => {
      const { renderCompiledRoute } =
        require('next/dist/experimental/testing/rsc/route-render') as typeof import('next/dist/experimental/testing/rsc/route-render')
      const RenderResult = require('next/dist/server/render-result')
        .default as typeof import('next/dist/server/render-result').default
      const native =
        require('next/dist/server/app-render/debug-channel-server.node') as typeof import('next/dist/server/app-render/debug-channel-server.node')
      const web =
        require('next/dist/server/app-render/debug-channel-server.web') as typeof import('next/dist/server/app-render/debug-channel-server.web')
      const channel =
        kind === 'node'
          ? native.createNodeDebugChannel()
          : web.createWebDebugChannel()
      const writer =
        kind === 'web' ? channel.serverSide.writable.getWriter() : undefined
      let finishProducer!: () => void
      let failProducer!: (error: unknown) => void
      const producer = new Promise<void>((resolve, reject) => {
        finishProducer = resolve
        failProducer = reject
      })
      void producer.catch(() => {})
      if (kind === 'node') channel.serverSide.on('error', failProducer)
      let producerFinished = false
      const cancel = jest.fn(() => {
        setImmediate(() => {
          if (writer) {
            void writer
              .write(new TextEncoder().encode('queued actual debug bytes'))
              .then(() => writer.close())
              .then(() => {
                producerFinished = true
                finishProducer()
              }, failProducer)
          } else {
            channel.serverSide.write(Buffer.from('queued actual debug bytes'))
            channel.serverSide.end((error: Error | undefined) => {
              if (error) failProducer(error)
              else {
                producerFinished = true
                finishProducer()
              }
            })
          }
        })
      })
      const closeRequest = jest.fn(async () => {})
      mockAcquireRequest = async () =>
        ({
          inputs: {},
          workContext: { renderOpts: { experimental: {} } },
          close: closeRequest,
        }) as unknown as Awaited<ReturnType<AcquireRequest>>
      const render = jest.fn(
        (
          _request: unknown,
          _response: unknown,
          context: Parameters<
            NonNullable<
              RscTestingBindings['routeRendering']
            >['ComponentMod']['routeModule']['render']
          >[2]
        ) => {
          context.renderOpts.setReactDebugChannel!(
            channel.clientSide,
            'actual-html',
            'actual-request'
          )
          return Promise.resolve(
            new RenderResult(
              new ReadableStream<Uint8Array>({
                start(controller) {
                  controller.enqueue(
                    new TextEncoder().encode('first native body bytes')
                  )
                },
                cancel,
              }),
              { metadata: {}, contentType: 'text/html; charset=utf-8' }
            )
          )
        }
      )
      const input = bindings()
      input.profile = { ...selected }
      input.route = {
        ...route,
        config: { ...route.config, dynamic: 'force-dynamic' },
        metadataPath: 'server/next-test/route.json',
      }
      input.requestContext = {
        mode: 'development',
        renderOpts: { cacheComponents: false },
        routeRenderOpts: { reactDebugChannel: true },
      } as NonNullable<RscTestingBindings['requestContext']>
      input.routeRendering = {
        ComponentMod: {
          routeModule: {
            definition: { page: route.page, pathname: route.pathname },
            render,
          },
        },
      } as unknown as NonNullable<RscTestingBindings['routeRendering']>
      input.cacheScope = { type: 'file', directory: '/owned-cache' }
      const cleanups: Array<() => Promise<void>> = []
      let handle: Awaited<ReturnType<typeof renderCompiledRoute>> | undefined
      try {
        handle = await renderCompiledRoute(
          input,
          {
            signal: new AbortController().signal,
            onCleanup: (cleanup) => cleanups.push(cleanup),
          },
          {
            ...options,
            format: 'html',
            url: 'http://localhost/base/acme/reference/x',
          },
          () =>
            ({ createIncrementalCache: () => ({}) }) as unknown as ReturnType<
              typeof import('next/dist/experimental/testing/request/compiled-file-cache').createCompiledFileCache
            >,
          () => {},
          true
        )
        await handle.response
        const reason = new Error(
          'main body cancelled before debug producer flush'
        )
        await handle.dispose(reason)
        expect(producerFinished).toBe(true)
        await producer
        expect(await handle.completed).toEqual({ status: 'aborted', reason })
        expect(cancel).toHaveBeenCalledTimes(1)
        expect(closeRequest).toHaveBeenCalledTimes(1)
        if ('readableEnded' in channel.clientSide.readable)
          expect(channel.clientSide.readable.readableEnded).toBe(true)
        else expect(channel.clientSide.readable.locked).toBe(false)
        await cleanups[0]()
      } finally {
        await handle?.dispose()
        writer?.releaseLock()
        mockAcquireRequest = undefined
      }
    }
  )
})
