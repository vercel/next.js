import { LazyModule } from '../../../../packages/next/src/server/lib/lazy-module'
import {
  AppRouteRouteModule,
  type AppRouteHandlerFn,
  type AppRouteRouteHandlerContext,
  type AppRouteUserlandModule,
} from '../../../../packages/next/src/server/route-modules/app-route/module'
import { RouteKind } from '../../../../packages/next/src/server/route-kind'
import { NextRequest } from '../../../../packages/next/src/server/web/spec-extension/request'

type PreparedExecution = {
  handler: AppRouteHandlerFn
  userland: AppRouteUserlandModule
  dynamic: AppRouteUserlandModule['dynamic']
  hasNonStaticMethods: boolean
}

type AppRouteRouteModuleInternals = {
  prepareExecution(
    request: NextRequest,
    context: AppRouteRouteHandlerContext
  ): Promise<PreparedExecution>
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function createContext(): AppRouteRouteHandlerContext {
  return {
    params: undefined,
    previewProps: {
      previewModeId: 'development',
      previewModeEncryptionKey: 'development',
      previewModeSigningKey: 'development',
    },
    renderOpts: {},
    sharedContext: { buildId: 'development', deploymentId: '' },
  } as AppRouteRouteHandlerContext
}

function createRouteModule(
  userland: () => AppRouteUserlandModule | Promise<AppRouteUserlandModule>,
  getUserland?: () => AppRouteUserlandModule | Promise<AppRouteUserlandModule>
) {
  return new AppRouteRouteModule({
    userland,
    getUserland,
    definition: {
      kind: RouteKind.APP_ROUTE,
      page: '/snapshot/route',
      pathname: '/snapshot',
      filename: 'route',
      bundlePath: 'app/snapshot/route',
    },
    distDir: '.next',
    relativeProjectDir: '',
    resolvedPagePath: 'app/snapshot/route.ts',
    nextConfigOutput: undefined,
  })
}

function prepare(
  routeModule: AppRouteRouteModule,
  context: AppRouteRouteHandlerContext
) {
  return (
    routeModule as unknown as AppRouteRouteModuleInternals
  ).prepareExecution(
    new NextRequest('http://localhost/snapshot', { method: 'GET' }),
    context
  )
}

async function responseText(handler: PreparedExecution['handler']) {
  const response = await handler(
    new NextRequest('http://localhost/snapshot', { method: 'GET' }),
    {}
  )
  expect(response).toBeInstanceOf(Response)
  return (response as Response).text()
}

describe('App Route live userland snapshots', () => {
  it('keeps one exact generation for every field of concurrent requests', async () => {
    const firstGeneration: AppRouteUserlandModule = {
      GET: () => new Response('first'),
      dynamic: 'force-static',
      fetchCache: 'force-no-store',
      revalidate: 11,
    }
    const secondGeneration: AppRouteUserlandModule = {
      GET: () => new Response('second'),
      POST: () => new Response('second-post'),
      dynamic: 'force-dynamic',
      fetchCache: 'force-cache',
      revalidate: 22,
    }
    const firstGenerationGate = createDeferred<AppRouteUserlandModule>()
    const load = jest.fn(() => {
      throw new Error('the fallback loader must not run')
    })
    const getUserland = jest
      .fn<AppRouteUserlandModule | Promise<AppRouteUserlandModule>, []>()
      .mockReturnValueOnce(firstGenerationGate.promise)
      .mockReturnValueOnce(secondGeneration)
    const routeModule = createRouteModule(load, getUserland)
    const firstContext = createContext()
    const secondContext = createContext()

    const firstPreparedPromise = prepare(routeModule, firstContext)
    const secondPrepared = await prepare(routeModule, secondContext)
    firstGenerationGate.resolve(firstGeneration)
    const firstPrepared = await firstPreparedPromise

    expect(getUserland).toHaveBeenCalledTimes(2)
    expect(load).not.toHaveBeenCalled()

    expect(firstPrepared.userland).toBe(firstGeneration)
    expect(await responseText(firstPrepared.handler)).toBe('first')
    expect(firstPrepared.dynamic).toBe('force-static')
    expect(firstPrepared.hasNonStaticMethods).toBe(false)
    expect(firstContext.renderOpts.fetchCache).toBe('force-no-store')
    expect(firstPrepared.userland.revalidate).toBe(11)

    expect(secondPrepared.userland).toBe(secondGeneration)
    expect(await responseText(secondPrepared.handler)).toBe('second')
    expect(secondPrepared.dynamic).toBe('force-dynamic')
    expect(secondPrepared.hasNonStaticMethods).toBe(true)
    expect(secondContext.renderOpts.fetchCache).toBe('force-cache')
    expect(secondPrepared.userland.revalidate).toBe(22)
  })

  it('recovers on the next generation after a rejected top-level-await import', async () => {
    const initialError = new Error('initial TLA failure')
    const recovered: AppRouteUserlandModule = {
      GET: () => new Response('recovered'),
      dynamic: 'force-static',
      fetchCache: 'only-no-store',
      revalidate: 33,
    }
    const load = jest.fn(() => {
      throw new Error('the fallback loader must not run')
    })
    const getUserland = jest
      .fn<AppRouteUserlandModule | Promise<AppRouteUserlandModule>, []>()
      .mockReturnValueOnce(Promise.reject(initialError))
      .mockReturnValueOnce(Promise.resolve(recovered))
    const routeModule = createRouteModule(load, getUserland)

    await expect(prepare(routeModule, createContext())).rejects.toBe(
      initialError
    )
    const prepared = await prepare(routeModule, createContext())

    expect(getUserland).toHaveBeenCalledTimes(2)
    expect(load).not.toHaveBeenCalled()
    expect(prepared.userland).toBe(recovered)
    expect(routeModule.userland).toBe(recovered)
    expect(await responseText(prepared.handler)).toBe('recovered')
  })

  it('does not await a userland module that exports then', async () => {
    const then = jest.fn()
    const userland: AppRouteUserlandModule & { then: typeof then } = {
      GET: () => new Response('not-thenable'),
      dynamic: 'force-static',
      then,
    }
    const getUserland = jest.fn(() => userland)
    const routeModule = createRouteModule(() => {
      throw new Error('the fallback loader must not run')
    }, getUserland)

    const prepared = await prepare(routeModule, createContext())

    expect(getUserland).toHaveBeenCalledTimes(1)
    expect(then).not.toHaveBeenCalled()
    expect(prepared.userland).toBe(userland)
    expect(await responseText(prepared.handler)).toBe('not-thenable')
  })
})

describe('LazyModule.initializeIfNeeded', () => {
  it('initializes an unloaded module without invoking its loader', () => {
    const load = jest.fn(() => 'loaded')
    const onLoad = jest.fn()
    const lazy = new LazyModule(load, onLoad)

    lazy.initializeIfNeeded('snapshot')
    lazy.initializeIfNeeded('later')

    expect(lazy.assertLoaded()).toBe('snapshot')
    expect(load).not.toHaveBeenCalled()
    expect(onLoad).toHaveBeenCalledTimes(1)
    expect(onLoad).toHaveBeenCalledWith('snapshot')
  })

  it('does not replace a pending loader result', async () => {
    const gate = createDeferred<string>()
    const lazy = new LazyModule(
      () => gate.promise,
      () => {}
    )

    lazy.loadIfNeeded()
    lazy.initializeIfNeeded('snapshot')
    gate.resolve('loaded')
    await lazy.waitUntilLoaded()

    expect(lazy.assertLoaded()).toBe('loaded')
  })

  it('does not replace an earlier rejection', async () => {
    const reason = new Error('load failed')
    const lazy = new LazyModule(
      () => Promise.reject(reason),
      () => {}
    )

    await expect(lazy.waitUntilLoaded()).rejects.toBe(reason)
    lazy.initializeIfNeeded('snapshot')

    expect(() => lazy.assertLoaded()).toThrow(reason)
  })

  it('remains retryable when snapshot validation throws', () => {
    const onLoad = jest.fn((module: string) => {
      if (module === 'invalid') throw new Error('invalid snapshot')
    })
    const load = jest.fn(() => 'loaded')
    const lazy = new LazyModule(load, onLoad)

    expect(() => lazy.initializeIfNeeded('invalid')).toThrow('invalid snapshot')
    lazy.initializeIfNeeded('valid')

    expect(lazy.assertLoaded()).toBe('valid')
    expect(load).not.toHaveBeenCalled()
  })
})
