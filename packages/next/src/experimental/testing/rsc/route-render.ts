import type { RscTestingBindings } from './index'
import type {
  RscRouteRenderOptions,
  RscRouteRenderResult,
  RscRouteStreamResult,
} from './types'
import type { RenderOpts } from '../../../server/app-render/types'
import type RenderResult from '../../../server/render-result'
import type { createCompiledFileCache } from '../request/compiled-file-cache'
import { createRequestResponseMocks } from '../../../server/lib/mock-request'
import {
  NodeNextRequest,
  NodeNextResponse,
} from '../../../server/base-http/node'
import { parseRequestHeaders } from '../../../server/route-modules/app-page/parse-request-headers'
import { interopDefault } from '../../../server/app-render/interop-default'
import { addRequestMeta } from '../../../server/request-meta'
import { signalFromNodeResponse } from '../../../server/web/spec-extension/adapters/next-request'
import { searchParamsToUrlQuery } from '../../../shared/lib/router/utils/querystring'
import { getBotType } from '../../../shared/lib/router/utils/is-bot'
import { shouldServeStreamingMetadata } from '../../../server/lib/streaming-metadata'
import { createRequestLifecycle } from '../request/request-lifecycle'
import { createCompiledRequestResources } from '../request/compiled-request'
import { RenderRequestCleanupError } from './render-request'
import { resolveCompiledRouteRequest, validateCompiledTestRoute } from './route'
import { createRouteStreamResponse } from './route-stream'
import { createRouteDebugChannelCollector } from './route-debug-channel'

export function renderCompiledRoute(
  bindings: RscTestingBindings,
  attempt: {
    signal: AbortSignal
    onCleanup(cleanup: () => Promise<void>): void
  },
  options: RscRouteRenderOptions,
  getFileCache: () => ReturnType<typeof createCompiledFileCache>,
  validateOwner: () => void
): Promise<RscRouteRenderResult>
export function renderCompiledRoute(
  bindings: RscTestingBindings,
  attempt: {
    signal: AbortSignal
    onCleanup(cleanup: () => Promise<void>): void
  },
  options: RscRouteRenderOptions,
  getFileCache: () => ReturnType<typeof createCompiledFileCache>,
  validateOwner: () => void,
  streaming: true
): Promise<RscRouteStreamResult>
export async function renderCompiledRoute(
  bindings: RscTestingBindings,
  attempt: {
    signal: AbortSignal
    onCleanup(cleanup: () => Promise<void>): void
  },
  options: RscRouteRenderOptions,
  getFileCache: () => ReturnType<typeof createCompiledFileCache>,
  validateOwner: () => void,
  streaming = false
): Promise<RscRouteRenderResult | RscRouteStreamResult> {
  const { profile, requestContext, routeRendering } = bindings
  if (
    (profile.mode !== 'development' && profile.mode !== 'production') ||
    profile.environment !== 'rsc' ||
    profile.runtime !== 'nodejs' ||
    profile.bundler !== 'turbopack' ||
    profile.route === undefined
  ) {
    throw new Error(
      'Full route rendering requires an explicit development or production Turbopack Node RSC route.'
    )
  }
  validateCompiledTestRoute(bindings.route, profile)
  const route = bindings.route!
  if (
    !requestContext ||
    requestContext.mode !== profile.mode ||
    !requestContext.routeRenderOpts ||
    !routeRendering
  ) {
    throw new Error(
      'Full route rendering requires matching compiled AppPage options, live entrypoint and manifests.'
    )
  }
  const liveRoute = routeRendering.ComponentMod.routeModule
  if (
    liveRoute.definition.page !== route.page ||
    liveRoute.definition.pathname !== route.pathname
  ) {
    throw new Error(
      'Full route rendering requires the selected live AppPage route identity.'
    )
  }
  if (
    route.config.dynamic !== 'force-dynamic' ||
    requestContext.renderOpts.cacheComponents
  ) {
    throw new Error(
      'Full route rendering currently requires force-dynamic routes without Cache Components or PPR.'
    )
  }
  if (options.cacheScope !== 'file' || bindings.cacheScope?.type !== 'file') {
    throw new Error(
      'Full route rendering requires explicit cacheScope: "file".'
    )
  }
  if (options.format !== 'html' && options.format !== 'flight') {
    throw new Error('Full route rendering requires format: "html" or "flight".')
  }
  attempt.signal.throwIfAborted()
  const url = new URL(options.url)
  const matched = await resolveCompiledRouteRequest(
    route,
    url,
    undefined,
    options.rootParams,
    attempt.signal
  )
  // Resolving route inputs can yield past the authored attempt. Validate its
  // originating async scope before allocating cache/request resources.
  validateOwner()
  const headers = { ...options.headers }
  if (
    headers.rsc !== undefined ||
    Object.keys(headers).some((key) =>
      key.toLowerCase().startsWith('next-router-')
    )
  ) {
    throw new Error(
      'Full route rendering uses its explicit format without router navigation headers.'
    )
  }
  if (options.format === 'flight') headers.rsc = '1'
  const cache = getFileCache()
  const lifecycle = createRequestLifecycle()
  const streamResponse = streaming
    ? createRouteStreamResponse(
        { url: url.pathname + url.search, headers, method: 'GET' },
        () => close()
      )
    : undefined
  const { req, res } =
    streamResponse ??
    createRequestResponseMocks({
      url: url.pathname + url.search,
      headers,
      method: 'GET',
    })
  // Keep a response failure observed even when setup fails before piping begins.
  void res.hasStreamed.catch(() => {})
  addRequestMeta(req, 'initURL', url.href)
  const nextReq = new NodeNextRequest(req)
  const nextRes = new NodeNextResponse(res)
  let request:
    | Awaited<ReturnType<typeof createCompiledRequestResources>>
    | undefined
  let acquiring: Promise<NonNullable<typeof request>> | undefined
  let disposedBeforeStart = false
  let rendering: Promise<RenderResult> | undefined
  let piping: Promise<void> | undefined
  let closing: Promise<void> | undefined
  const debugChannels =
    profile.mode === 'development' &&
    requestContext.routeRenderOpts.reactDebugChannel === true
      ? createRouteDebugChannelCollector()
      : undefined
  const abortResponse = () => {
    if (streamResponse) {
      void streamResponse.dispose(attempt.signal.reason).catch(() => {})
    } else res.destroy()
  }
  attempt.signal.addEventListener('abort', abortResponse, { once: true })
  const close = () =>
    (closing ??= Promise.resolve().then(async () => {
      const errors: unknown[] = []
      let cancellingLateRender = false
      let lateRenderReason: unknown
      if (!res.writableFinished) res.destroy()
      try {
        // Streaming cleanup owns acquisition too; late resources cannot outlive
        // the request/adapter close that is already joining them.
        if (streamResponse && acquiring) request ??= await acquiring
        const result = await rendering
        if (streamResponse?.started) {
          // Its adapter joined the actual pipe before calling this close.
        } else if (piping) await piping
        else if (result) {
          // Use RenderResult's public stream owner so even a render completed
          // during teardown propagates cancellation to its normal source stream.
          cancellingLateRender = streamResponse !== undefined
          lateRenderReason = streamResponse
            ? streamResponse.reason
            : new DOMException('Route render disposed', 'AbortError')
          await result.pipeTo(
            new WritableStream({
              start(controller) {
                controller.error(lateRenderReason)
              },
            })
          )
        }
      } catch (error) {
        if (!cancellingLateRender || error !== lateRenderReason) {
          errors.push(error)
        }
      }
      try {
        await (request?.close() ?? lifecycle.close())
      } catch (error) {
        errors.push(error)
      }
      try {
        await debugChannels?.close()
      } catch (error) {
        errors.push(error)
      }
      attempt.signal.removeEventListener('abort', abortResponse)
      if (errors.length)
        throw new RenderRequestCleanupError([...new Set(errors)])
    }))
  attempt.onCleanup(() => (streamResponse ? streamResponse.dispose() : close()))
  try {
    acquiring = createCompiledRequestResources(requestContext, {
      page: route.page,
      url,
      headers,
      rootParams: matched.rootParams,
      incrementalCache: cache.createIncrementalCache(headers),
      lifecycle,
    })
    request = await acquiring
    if (closing || streamResponse?.disposing) {
      if (streamResponse) {
        disposedBeforeStart = true
        await streamResponse.dispose()
        throw streamResponse.reason
      }
      await request.close()
      throw new Error(
        'The RSC test lifetime ended while creating its route request.'
      )
    }
    validateOwner()
    attempt.signal.throwIfAborted()
    const {
      clientAssetToken,
      htmlLimitedBots,
      reactDebugChannel: _reactDebugChannel,
      ...routeOptions
    } = requestContext.routeRenderOpts
    const ComponentMod = routeRendering.ComponentMod
    const userAgent = headers['user-agent'] || ''
    const renderOpts: RenderOpts = {
      ...routeOptions,
      ...request.workContext.renderOpts,
      ...routeRendering,
      App: () => null,
      Document: () => null,
      pageConfig: {},
      Component: interopDefault(ComponentMod),
      routeModule: ComponentMod.routeModule,
      page: route.page,
      params: matched.params,
      // Normal AppPage requests support dynamic responses for non-SSG routes.
      supportsDynamicResponse:
        profile.mode === 'development' ||
        route.config.dynamic === 'force-dynamic',
      dir: process.cwd(),
      botType: getBotType(userAgent),
      serveStreamingMetadata: !userAgent
        ? false
        : shouldServeStreamingMetadata(userAgent, htmlLimitedBots),
      previewProps: request.inputs.previewProps,
      ...(debugChannels && {
        setReactDebugChannel: debugChannels.setReactDebugChannel,
        renderAbortSignal: signalFromNodeResponse(res),
      }),
      experimental: {
        ...routeOptions.experimental,
        ...request.workContext.renderOpts.experimental,
        // As in the normal AppPage handler, PPR requires Cache Components.
        // That actual compiler capability is refused above for this slice.
        isRoutePPREnabled: requestContext.renderOpts.cacheComponents,
      },
    }
    rendering = ComponentMod.routeModule.render(nextReq, nextRes, {
      page: route.pathname,
      params: matched.params,
      query: searchParamsToUrlQuery(url.searchParams),
      fallbackRouteParams: null,
      routeMatch: { resolvedPathname: url.pathname },
      parsedRequestHeaders: parseRequestHeaders(headers, {
        isRoutePPREnabled: renderOpts.experimental.isRoutePPREnabled === true,
        previewModeId: renderOpts.previewProps?.previewModeId,
      }),
      renderOpts,
      dev: undefined,
      sharedContext: {
        buildId: requestContext.buildId,
        deploymentId: requestContext.deploymentId,
        clientAssetToken,
      },
    })
    const result = await rendering
    if (streamResponse?.disposing) {
      disposedBeforeStart = true
      await streamResponse.dispose()
      throw streamResponse.reason
    }
    for (const [name, value] of Object.entries(result.metadata.headers ?? {})) {
      if (value !== undefined) res.setHeader(name, value)
    }
    if (result.contentType && !res.hasHeader('Content-Type')) {
      res.setHeader('Content-Type', result.contentType)
    }
    if (streamResponse) {
      const started = streamResponse.start(result)
      piping = started.piping
      return started.result
    }
    piping = result.pipeToNodeResponse(res)
    await piping
    attempt.signal.throwIfAborted()
    await close()
    return {
      body: Buffer.concat(res.buffers).toString('utf8'),
      status: res.statusCode,
      headers: res.getHeaders(),
      contentType: result.contentType ?? undefined,
    }
  } catch (error) {
    if (streamResponse) {
      if (disposedBeforeStart) throw error
      try {
        await streamResponse.reject(error)
      } catch (cleanupError) {
        if (cleanupError !== error) {
          throw new RenderRequestCleanupError([error, cleanupError])
        }
      }
      throw error
    }
    try {
      await close()
    } catch (cleanupError) {
      if (cleanupError !== error)
        throw new RenderRequestCleanupError([error, cleanupError])
    }
    throw error
  }
}
