import type { IncomingMessage } from 'node:http'
import type { Socket } from 'node:net'
import type { Duplex } from 'node:stream'

import type { AppRouteRouteModule } from './module.compiled'
import {
  addRequestMeta,
  getRequestMeta,
  setRequestMeta,
  type RequestMeta,
} from '../../request-meta'
import { normalizeAppPath } from '../../../shared/lib/router/utils/app-paths'
import { BaseServerSpan } from '../../lib/trace/constants'
import {
  getTracer,
  SpanKind,
  SpanStatusCode,
  type Span,
} from '../../lib/trace/tracer'
import { getRevalidateReason } from '../../instrumentation/utils'
import { fromNodeOutgoingHttpHeaders } from '../../web/utils'
import { isWebSocketUpgradeResponse } from '../../web/spec-extension/websocket-upgrade-response'
import { getConnectionHeaderTokens } from '../../web/spec-extension/websocket-connection-headers'
import type { NextRequest } from '../../web/spec-extension/request'
import { CloseController } from '../../web/web-on-close'
import {
  combineListenerFailures,
  createOwnedListeners,
  filterWebSocketUpgradeRequestHeaders,
  getRawHttpResponseStatus,
  isForbiddenWebSocketUpgradeResponseHeader,
  isWebSocketClientDisconnectError,
  ownWebSocketUpgradeSocketErrors,
  validateWebSocketHandshake,
  validateWebSocketOrigin,
  writeRawHttpError,
  writeRawHttpResponse,
} from '../../websocket-http'
import type { WebSocketUpgradeTransport } from '../../websocket-upgrade'
import { runInWebSocketHookContext } from '../../websocket-hook-context'
import { MockedResponse } from '../../lib/mock-request'
import { getProperError } from '../../../lib/is-error'

export interface AppRouteHandlerContext {
  waitUntil?: (promise: Promise<void>) => void
  requestMeta?: RequestMeta
  responseHeaders?: Record<string, string | string[]>
}

export interface AppRouteUpgradeOutcome {
  statusCode?: number
  upgraded: boolean
}

export interface AppRouteUpgradeHandlerTransport {
  node: {
    req: IncomingMessage
    socket: Duplex
    head: Buffer
  }
}

export interface AppRouteWebSocketEntrypoint {
  upgradeHandler(
    ctx: AppRouteHandlerContext,
    transport: AppRouteUpgradeHandlerTransport
  ): Promise<AppRouteUpgradeOutcome>
}

function appendWebSocketHeaderLayer(
  target: Headers,
  source: Headers,
  preHandler: boolean,
  nominatedHopByHopHeaders: ReadonlySet<string> = new Set()
): void {
  for (const [name, value] of source) {
    const lowerName = name.toLowerCase()
    if (lowerName === 'set-cookie') continue
    if (nominatedHopByHopHeaders.has(lowerName)) continue
    if (preHandler && isForbiddenWebSocketUpgradeResponseHeader(lowerName)) {
      continue
    }
    target.set(name, value)
  }
  if (nominatedHopByHopHeaders.has('set-cookie')) return
  for (const cookie of source.getSetCookie()) {
    target.append('set-cookie', cookie)
  }
}

function mergeWebSocketResponseHeaders(
  routingHeaders: Record<string, string | string[]> | undefined,
  prepareHeaders: Headers,
  responseHeaders?: Headers
): Headers {
  const headers = new Headers()
  const routingHeaderLayer = routingHeaders
    ? fromNodeOutgoingHttpHeaders(routingHeaders)
    : undefined
  const nominatedHopByHopHeaders = new Set<string>()
  for (const layer of [routingHeaderLayer, prepareHeaders]) {
    if (!layer) continue
    for (const name of getConnectionHeaderTokens(layer)) {
      nominatedHopByHopHeaders.add(name)
    }
  }
  if (routingHeaderLayer) {
    appendWebSocketHeaderLayer(
      headers,
      routingHeaderLayer,
      true,
      nominatedHopByHopHeaders
    )
  }
  appendWebSocketHeaderLayer(
    headers,
    prepareHeaders,
    true,
    nominatedHopByHopHeaders
  )
  if (responseHeaders) {
    appendWebSocketHeaderLayer(
      headers,
      responseHeaders,
      false,
      nominatedHopByHopHeaders
    )
  }
  return headers
}

function isWebSocketUpgradeClientDisconnect(
  error: unknown,
  signal: AbortSignal | undefined,
  socket: Duplex
): boolean {
  if (isWebSocketClientDisconnectError(error)) return true
  try {
    if (error != null && socket.errored === error) return true
  } catch {}
  try {
    return Boolean(
      error !== undefined && signal?.aborted && signal.reason === error
    )
  } catch {
    return false
  }
}

/** @internal Owns request-close delivery across EventEmitter reentrancy. */
export function installAppRouteWebSocketRequestCloseListener(
  socket: Duplex,
  closeController: CloseController
): () => void {
  let installing = true
  let closeRequested = false
  const listeners = createOwnedListeners()
  const removeListener = (): unknown[] => listeners.remove()
  const dispatchClose = () => {
    if (
      installing &&
      !socket.destroyed &&
      !socket.closed &&
      !socket.readableEnded &&
      !socket.writableEnded
    ) {
      return
    }
    if (installing) {
      closeRequested = true
      return
    }
    const failures = removeListener()
    if (!closeController.isClosed) closeController.dispatchClose()
    for (const failure of failures) {
      try {
        console.error(
          'Failed to remove an App Route WebSocket request close listener',
          failure
        )
      } catch {}
    }
  }
  const installFailures = listeners.install([
    { target: socket, event: 'close', listener: dispatchClose },
  ])
  installing = false
  if (installFailures.length > 0) {
    throw combineListenerFailures(
      installFailures,
      'Failed to install an App Route WebSocket request close listener'
    )
  }
  if (
    closeRequested ||
    socket.destroyed ||
    socket.closed ||
    socket.readableEnded ||
    socket.writableEnded
  ) {
    dispatchClose()
  }
  return dispatchClose
}

/** @internal */
export function finalizeAppRouteWebSocketUpgradeSpan(
  span: Span | undefined,
  method: string,
  route: string,
  outcome: AppRouteUpgradeOutcome | undefined,
  caughtError: unknown
): void {
  if (!span) return
  const name = `${method} ${route}`
  span.setAttributes({
    'next.rsc': false,
    'next.route': route,
    'http.route': route,
    'next.span_name': name,
  })
  if (outcome?.statusCode !== undefined) {
    span.setAttribute('http.status_code', outcome.statusCode)
  }
  if (caughtError !== undefined) {
    const error = getProperError(caughtError)
    span.recordException(error)
    span.setAttribute('error.type', error.name)
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message })
  } else if (outcome?.statusCode !== undefined && outcome.statusCode >= 500) {
    span.setStatus({ code: SpanStatusCode.ERROR })
  }
  span.updateName(name)
}

/** Creates the Node-only upgrade entrypoint for one generated App Route. */
export function createAppRouteWebSocketEntrypoint({
  routeModule,
  srcPage,
  multiZoneDraftMode,
  createNextRequest,
}: {
  routeModule: AppRouteRouteModule
  srcPage: string
  multiZoneDraftMode: boolean
  createNextRequest(req: IncomingMessage, socket: Duplex): NextRequest
}): AppRouteWebSocketEntrypoint {
  const route = normalizeAppPath(srcPage)
  let warnedStaticUpgradeRejection = false
  let webSocketUpgradeTransport: WebSocketUpgradeTransport | undefined
  let webSocketRegistry:
    | typeof import('../../websocket-connection-registry')
    | undefined

  const getWebSocketRegistry = () =>
    (webSocketRegistry ??=
      require('../../websocket-connection-registry') as typeof import('../../websocket-connection-registry'))

  const getWebSocketUpgradeTransport = () => {
    if (webSocketUpgradeTransport) return webSocketUpgradeTransport
    const { createWebSocketUpgradeTransport } =
      require('../../websocket-upgrade') as typeof import('../../websocket-upgrade')
    const { registerWebSocketPeer, unregisterWebSocketPeer } =
      getWebSocketRegistry()
    return (webSocketUpgradeTransport = createWebSocketUpgradeTransport({
      runInHookContext: runInWebSocketHookContext,
      registerPeer(_peer, connection, context) {
        if (!context.registryScope) return
        return registerWebSocketPeer(connection, context.registryScope)
      },
      unregisterPeer(_peer, connection, context) {
        if (context.registryScope) {
          unregisterWebSocketPeer(connection, context.registryScope)
        }
      },
    }))
  }

  const reportRequestError = (
    req: IncomingMessage,
    error: unknown,
    routerServerContext?: Parameters<AppRouteRouteModule['onRequestError']>[4]
  ) =>
    routeModule.onRequestError(
      req,
      error,
      {
        routerKind: 'App Router',
        routePath: route,
        routeType: 'route',
        revalidateReason: getRevalidateReason({
          isStaticGeneration: false,
          isOnDemandRevalidate: false,
        }),
      },
      false,
      routerServerContext
    )

  async function upgradeHandler(
    ctx: AppRouteHandlerContext,
    transport: AppRouteUpgradeHandlerTransport
  ): Promise<AppRouteUpgradeOutcome> {
    const node = transport?.node
    const req = node?.req
    const socket = node?.socket
    const head = node?.head
    const transportMessage =
      'WebSocket Route Handlers require the Node.js upgrade transport namespace with raw upgrade primitives and persistent sockets.'

    if (
      !socket ||
      typeof socket.write !== 'function' ||
      socket.destroyed ||
      socket.writableEnded ||
      socket.readableEnded
    ) {
      console.error(transportMessage)
      return { upgraded: false }
    }
    if (!req) {
      console.error(transportMessage)
      socket.destroy()
      return { upgraded: false }
    }

    ownWebSocketUpgradeSocketErrors(req, socket)
    const method = req.method || 'GET'
    const tracer = getTracer()
    return tracer.withPropagatedContext(req.headers, () =>
      tracer.trace(
        BaseServerSpan.handleRequest,
        {
          spanName: method,
          kind: SpanKind.SERVER,
          attributes: {
            'http.method': method,
            'http.target': req.url,
          },
        },
        async (span) => {
          let outcome: AppRouteUpgradeOutcome | undefined
          let caughtError: unknown
          let reportError = (error: unknown) => reportRequestError(req, error)
          let requestSignal: AbortSignal | undefined
          try {
            if (!Buffer.isBuffer(head)) {
              console.error(transportMessage)
              await writeRawHttpError(req, socket, 501, transportMessage)
              return (outcome = { statusCode: 501, upgraded: false })
            }
            return (outcome = await upgradeHandlerImpl(
              req,
              socket,
              head,
              ctx,
              getRequestMeta(req, 'webSocketRegistryScope'),
              (report) => {
                reportError = report
              },
              (signal) => {
                requestSignal = signal
              }
            ))
          } catch (error) {
            const clientDisconnected = isWebSocketUpgradeClientDisconnect(
              error,
              requestSignal,
              socket
            )
            if (!clientDisconnected) {
              caughtError = getProperError(error)
              await reportError(error)
            }

            const committedStatusCode = getRawHttpResponseStatus(socket)
            if (committedStatusCode !== undefined) {
              socket.destroy()
              return (outcome = {
                statusCode: committedStatusCode,
                upgraded: committedStatusCode === 101,
              })
            }
            if (
              !socket.destroyed &&
              !socket.writableEnded &&
              !socket.readableEnded
            ) {
              try {
                await writeRawHttpError(
                  req,
                  socket,
                  500,
                  'Internal Server Error'
                )
                return (outcome = { statusCode: 500, upgraded: false })
              } catch (writeError) {
                if (
                  !isWebSocketUpgradeClientDisconnect(
                    writeError,
                    undefined,
                    socket
                  )
                ) {
                  console.error(
                    'Failed to write WebSocket upgrade error',
                    writeError
                  )
                }
                if (!socket.destroyed) socket.destroy()
              }
            }
            return (outcome = { upgraded: false })
          } finally {
            finalizeAppRouteWebSocketUpgradeSpan(
              span,
              method,
              route,
              outcome,
              caughtError
            )
          }
        }
      )
    )
  }

  async function upgradeHandlerImpl(
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    ctx: AppRouteHandlerContext,
    trustedRegistryScope: object | undefined,
    setReportError: (report: (error: unknown) => Promise<void>) => void,
    setRequestSignal: (signal: AbortSignal) => void
  ): Promise<AppRouteUpgradeOutcome> {
    if (ctx.requestMeta) {
      const requestMeta = { ...ctx.requestMeta }
      delete requestMeta.webSocketRegistryScope
      setRequestMeta(req, requestMeta)
    }
    if (trustedRegistryScope) {
      addRequestMeta(req, 'webSocketRegistryScope', trustedRegistryScope)
    }
    filterWebSocketUpgradeRequestHeaders(req)

    const handshakeError = validateWebSocketHandshake(req)
    if (handshakeError) {
      await writeRawHttpError(
        req,
        socket,
        handshakeError.status,
        handshakeError.message,
        handshakeError.headers
      )
      return { statusCode: handshakeError.status, upgraded: false }
    }

    if (routeModule.isDev) {
      addRequestMeta(
        req,
        'devRequestTimingInternalsEnd',
        process.hrtime.bigint()
      )
    }

    const mockedRes = new MockedResponse({ socket: socket as Socket })
    const preparation = await routeModule.prepareNodeRequest(req, mockedRes, {
      srcPage,
      multiZoneDraftMode,
    })
    if (!preparation) {
      await writeRawHttpError(
        req,
        socket,
        400,
        'Bad Request',
        mergeWebSocketResponseHeaders(ctx.responseHeaders, mockedRes.headers)
      )
      return { statusCode: 400, upgraded: false }
    }

    const { prepareResult, normalizedSrcPage, isIsr } = preparation
    const { nextConfig, isDraftMode, routerServerContext } = prepareResult

    const webSocketConfig = nextConfig.experimental.webSocketRouteHandlers
    const allowedOrigins =
      webSocketConfig && typeof webSocketConfig === 'object'
        ? webSocketConfig.allowedOrigins
        : undefined
    const originError = validateWebSocketOrigin(req, allowedOrigins)
    if (originError) {
      await writeRawHttpError(
        req,
        socket,
        originError.status,
        originError.message,
        originError.headers
      )
      return { statusCode: originError.status, upgraded: false }
    }

    if (isIsr && !isDraftMode) {
      if (!warnedStaticUpgradeRejection) {
        warnedStaticUpgradeRejection = true
        console.warn(
          `Rejected a WebSocket upgrade for "${normalizedSrcPage}" because this App Route is statically prerendered or ISR-cacheable. WebSocket Route Handlers require a dynamic route (for example, add \`export const dynamic = 'force-dynamic'\`).`
        )
      }
      await writeRawHttpError(
        req,
        socket,
        404,
        'Not Found',
        mergeWebSocketResponseHeaders(ctx.responseHeaders, mockedRes.headers)
      )
      return { statusCode: 404, upgraded: false }
    }

    const closeController = new CloseController()
    const { context } = await routeModule.createNodeRequestContext(
      req,
      srcPage,
      prepareResult,
      {
        waitUntil: ctx.waitUntil,
        onClose: closeController.onClose.bind(closeController),
        onAfterTaskError: undefined,
      }
    )
    const completeRequest = installAppRouteWebSocketRequestCloseListener(
      socket,
      closeController
    )
    const reportError = (error: unknown) =>
      reportRequestError(req, error, routerServerContext)
    setReportError(reportError)

    const nextReq = createNextRequest(req, socket)
    setRequestSignal(nextReq.signal)
    try {
      let response = await routeModule.handle(nextReq, context)
      const isUpgradeResponse = isWebSocketUpgradeResponse(response)
      const responseHeaders = mergeWebSocketResponseHeaders(
        ctx.responseHeaders,
        mockedRes.headers,
        response.headers
      )
      if (isUpgradeResponse) {
        const nextResponse = response.clone()
        for (const name of Array.from(nextResponse.headers.keys())) {
          nextResponse.headers.delete(name)
        }
        appendWebSocketHeaderLayer(nextResponse.headers, responseHeaders, false)
        response = nextResponse
      } else {
        response = new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
        })
      }

      ;(req as any).fetchMetrics = (context.renderOpts as any).fetchMetrics
      const pendingWaitUntil = context.renderOpts.pendingWaitUntil
      if (pendingWaitUntil && ctx.waitUntil) ctx.waitUntil(pendingWaitUntil)

      if (!isWebSocketUpgradeResponse(response)) {
        await writeRawHttpResponse(req, socket, response)
        return { statusCode: response.status, upgraded: false }
      }

      if (!trustedRegistryScope) {
        await writeRawHttpError(req, socket, 500, 'Internal Server Error')
        return { statusCode: 500, upgraded: false }
      }

      const outcome = await getWebSocketUpgradeTransport().handleUpgrade(
        req,
        socket,
        head,
        nextReq,
        response,
        {
          onHookError: reportError,
          trackTask(task) {
            getWebSocketRegistry().trackWebSocketTask(
              task,
              trustedRegistryScope
            )
          },
          registryScope: trustedRegistryScope,
        }
      )
      return outcome
    } finally {
      completeRequest()
    }
  }

  return { upgradeHandler }
}
