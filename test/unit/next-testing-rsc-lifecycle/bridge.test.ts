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
  } finally {
    await runtime.dispose()
  }
})

it.each([
  { environment: 'node' as const },
  { mode: 'production' as const, route: '/reference' },
])('rejects unsupported profile %j before rendering', async (profile) => {
  const input = bindings()
  Object.assign(input.profile, profile)
  const runtime = initializeRscTesting(input)
  try {
    await expect(rsc.render(Component, {}, options)).rejects.toThrow(
      'only route-less Turbopack Node RSC subtrees'
    )
    expect(input.ConsumerMod.decodeFlight).not.toHaveBeenCalled()
  } finally {
    await runtime.dispose()
  }
})

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
  const { validateCompiledTestRoute, resolveCompiledRouteRequest } =
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
  it('derives decoded params and actual loader-tree root params with the normal route matcher', async () => {
    expect(() => validateCompiledTestRoute(route, selected)).not.toThrow()
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
  it('requires route facts even when a route string is configured', async () => {
    const input = bindings()
    input.profile.route = '/reference/[slug]'
    const runtime = initializeRscTesting(input)
    try {
      await expect(rsc.render(Component, {}, options)).rejects.toThrow(
        'matching native AppProject route metadata'
      )
    } finally {
      await runtime.dispose()
    }
  })
})
