import { IncomingMessage, ServerResponse } from 'http'
import nanoid from 'next/dist/compiled/nanoid/index.js'
import { ParsedUrlQuery } from 'querystring'
import { format as formatUrl, parse as parseUrl } from 'url'
import { withCoalescedInvoke } from '../../lib/coalesced-function'
import { isDynamicRoute } from '../lib/router/utils'
import { isResSent } from '../lib/utils'
import { tryGetPreviewData, __ApiPreviewProps } from './api-utils'
import { loadComponents, LoadComponentsReturnType } from './load-components'
import { normalizePagePath } from './normalize-page-path'
import { renderToHTML } from './render'
import { Params } from './router'
import { getFallback, getSprCache, setSprCache } from './spr-cache'

export type RenderOpts = any

export type RequestContext = {
  pathname: string
  query: ParsedUrlQuery
  params: Params | null
  renderOpts: RenderOpts
}

export type ServerContext = {
  buildId: string
  distDir: string
  isLikeServerless: boolean
  getPreviewProps: () => __ApiPreviewProps
  getStaticPaths: (
    pathname: string
  ) => Promise<{
    staticPaths: string[] | undefined
    hasStaticFallback: boolean
  }>
}

export type RequestHandler = (
  req: IncomingMessage,
  res: ServerResponse
) => Promise<string | false | null>

export async function getRequestHandler(
  serverCtx: ServerContext,
  requestCtx: RequestContext
): Promise<RequestHandler | null> {
  const { params, pathname, query, renderOpts } = requestCtx
  const { buildId, distDir, isLikeServerless } = serverCtx
  const paths = [
    // try serving a static AMP version first
    query.amp ? normalizePagePath(pathname) + '.amp' : null,
    pathname,
  ].filter(Boolean)
  for (const pagePath of paths) {
    try {
      const components = await loadComponents(
        distDir,
        buildId,
        pagePath!,
        !renderOpts.dev && isLikeServerless
      )
      return async (req, res) =>
        await renderToHTMLWithComponents(
          req,
          res,
          serverCtx,
          {
            ...requestCtx,
            query: {
              ...(components.getStaticProps
                ? { _nextDataReq: query._nextDataReq }
                : query),
              ...(params || {}),
            },
          },
          components
        )
    } catch (err) {
      if (err.code !== 'ENOENT') throw err
    }
  }
  return null
}

async function renderToHTMLWithComponents(
  req: IncomingMessage,
  res: ServerResponse,
  { buildId, getPreviewProps, getStaticPaths }: ServerContext,
  { pathname, query, renderOpts }: RequestContext,
  components: LoadComponentsReturnType
): Promise<string | false | null> {
  // we need to ensure the status code if /404 is visited directly
  if (pathname === '/404') {
    res.statusCode = 404
  }

  // handle static page
  if (typeof components.Component === 'string') {
    return components.Component
  }

  // check request state
  const isLikeServerless =
    typeof components.Component === 'object' &&
    typeof (components.Component as any).renderReqToHTML === 'function'
  const isSSG = !!components.getStaticProps
  const isServerProps = !!components.getServerSideProps
  const hasStaticPaths = !!components.getStaticPaths

  // Toggle whether or not this is a Data request
  const isDataReq = query._nextDataReq
  delete query._nextDataReq

  // Serverless requests need its URL transformed back into the original
  // request path (to emulate lambda behavior in production)
  if (isLikeServerless && isDataReq) {
    let { pathname } = parseUrl(req.url || '', true)
    pathname = !pathname || pathname === '/' ? '/index' : pathname
    req.url = formatUrl({
      pathname: `/_next/data/${buildId}${pathname}.json`,
      query,
    })
  }

  // non-spr requests should render like normal
  if (!isSSG) {
    // handle serverless
    if (isLikeServerless) {
      if (isDataReq) {
        const renderResult = await (components.Component as any).renderReqToHTML(
          req,
          res,
          true
        )

        sendPayload(
          res,
          JSON.stringify(renderResult?.renderOpts?.pageData),
          'application/json',
          !renderOpts.dev
            ? {
                revalidate: -1,
                private: false, // Leave to user-land caching
              }
            : undefined
        )
        return null
      }
      prepareServerlessUrl(req, query)
      return (components.Component as any).renderReqToHTML(req, res)
    }

    if (isDataReq && isServerProps) {
      const props = await renderToHTML(req, res, pathname, query, {
        ...components,
        ...renderOpts,
        isDataReq,
      })
      sendPayload(
        res,
        JSON.stringify(props),
        'application/json',
        !renderOpts.dev
          ? {
              revalidate: -1,
              private: false, // Leave to user-land caching
            }
          : undefined
      )
      return null
    }

    return renderToHTML(req, res, pathname, query, {
      ...components,
      ...renderOpts,
    })
  }

  const previewProps = getPreviewProps()
  const previewData = tryGetPreviewData(req, res, { ...previewProps })
  const isPreviewMode = previewData !== false

  // Compute the SPR cache key
  const urlPathname = parseUrl(req.url || '').pathname!
  const ssgCacheKey = isPreviewMode
    ? `__` + nanoid() // Preview mode uses a throw away key to not coalesce preview invokes
    : urlPathname

  // Complete the response with cached data if its present
  const cachedData = isPreviewMode
    ? // Preview data bypasses the cache
      undefined
    : await getSprCache(ssgCacheKey)
  if (cachedData) {
    const data = isDataReq
      ? JSON.stringify(cachedData.pageData)
      : cachedData.html

    sendPayload(
      res,
      data,
      isDataReq ? 'application/json' : 'text/html; charset=utf-8',
      cachedData.curRevalidate !== undefined && !renderOpts.dev
        ? { revalidate: cachedData.curRevalidate, private: isPreviewMode }
        : undefined
    )

    // Stop the request chain here if the data we sent was up-to-date
    if (!cachedData.isStale) {
      return null
    }
  }

  // If we're here, that means data is missing or it's stale.

  const doRender = withCoalescedInvoke(async function(): Promise<{
    html: string | null
    pageData: any
    sprRevalidate: number | false
  }> {
    let pageData: any
    let html: string | null
    let sprRevalidate: number | false

    let renderResult
    // handle serverless
    if (isLikeServerless) {
      renderResult = await (components.Component as any).renderReqToHTML(
        req,
        res,
        true
      )

      html = renderResult.html
      pageData = renderResult.renderOpts.pageData
      sprRevalidate = renderResult.renderOpts.revalidate
    } else {
      const _renderOpts = {
        ...components,
        ...renderOpts,
      }
      renderResult = await renderToHTML(req, res, pathname, query, _renderOpts)

      html = renderResult
      pageData = _renderOpts.pageData
      sprRevalidate = _renderOpts.revalidate
    }

    return { html, pageData, sprRevalidate }
  })

  const isProduction = !renderOpts.dev
  const isDynamicPathname = isDynamicRoute(pathname)
  const didRespond = isResSent(res)

  const { staticPaths, hasStaticFallback } = hasStaticPaths
    ? await getStaticPaths(pathname)
    : { staticPaths: undefined, hasStaticFallback: false }

  // const isForcedBlocking =
  //   req.headers['X-Prerender-Bypass-Mode'] !== 'Blocking'

  // When we did not respond from cache, we need to choose to block on
  // rendering or return a skeleton.
  //
  // * Data requests always block.
  //
  // * Preview mode toggles all pages to be resolved in a blocking manner.
  //
  // * Non-dynamic pages should block (though this is an impossible
  //   case in production).
  //
  // * Dynamic pages should return their skeleton if not defined in
  //   getStaticPaths, then finish the data request on the client-side.
  //
  if (
    !didRespond &&
    !isDataReq &&
    !isPreviewMode &&
    isDynamicPathname &&
    // Development should trigger fallback when the path is not in
    // `getStaticPaths`
    (isProduction || !staticPaths || !staticPaths.includes(urlPathname))
  ) {
    if (
      // In development, fall through to render to handle missing
      // getStaticPaths.
      (isProduction || staticPaths) &&
      // When fallback isn't present, abort this render so we 404
      !hasStaticFallback
    ) {
      return false
    }

    let html: string

    // Production already emitted the fallback as static HTML.
    if (isProduction) {
      html = await getFallback(pathname)
    }
    // We need to generate the fallback on-demand for development.
    else {
      query.__nextFallback = 'true'
      if (isLikeServerless) {
        prepareServerlessUrl(req, query)
        html = await (components.Component as any).renderReqToHTML(req, res)
      } else {
        html = (await renderToHTML(req, res, pathname, query, {
          ...components,
          ...renderOpts,
        })) as string
      }
    }

    sendPayload(res, html, 'text/html; charset=utf-8')
  }

  const {
    isOrigin,
    value: { html, pageData, sprRevalidate },
  } = await doRender(ssgCacheKey, [])
  if (!isResSent(res)) {
    sendPayload(
      res,
      isDataReq ? JSON.stringify(pageData) : html,
      isDataReq ? 'application/json' : 'text/html; charset=utf-8',
      !renderOpts.dev
        ? { revalidate: sprRevalidate, private: isPreviewMode }
        : undefined
    )
  }

  // Update the SPR cache if the head request
  if (isOrigin) {
    // Preview mode should not be stored in cache
    if (!isPreviewMode) {
      await setSprCache(ssgCacheKey, { html: html!, pageData }, sprRevalidate)
    }
  }

  return null
}

function sendPayload(
  res: ServerResponse,
  payload: any,
  type: string,
  options?: { revalidate: number | false; private: boolean }
) {
  // TODO: ETag? Cache-Control headers? Next-specific headers?
  res.setHeader('Content-Type', type)
  res.setHeader('Content-Length', Buffer.byteLength(payload))
  if (options != null) {
    if (options?.private) {
      res.setHeader(
        'Cache-Control',
        `private, no-cache, no-store, max-age=0, must-revalidate`
      )
    } else if (options?.revalidate) {
      res.setHeader(
        'Cache-Control',
        options.revalidate < 0
          ? `no-cache, no-store, must-revalidate`
          : `s-maxage=${options.revalidate}, stale-while-revalidate`
      )
    } else if (options?.revalidate === false) {
      res.setHeader(
        'Cache-Control',
        `s-maxage=31536000, stale-while-revalidate`
      )
    }
  }
  res.end(payload)
}

export function prepareServerlessUrl(
  req: IncomingMessage,
  query: ParsedUrlQuery
) {
  const curUrl = parseUrl(req.url!, true)
  req.url = formatUrl({
    ...curUrl,
    search: undefined,
    query: {
      ...curUrl.query,
      ...query,
    },
  })
}
