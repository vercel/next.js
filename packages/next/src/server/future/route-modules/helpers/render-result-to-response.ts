import type { MockedResponse } from '../../../lib/mock-request'
import type { RouteDefinition } from '../../route-definitions/route-definition'
import type { Redirect } from '../../../../../types'
import type RenderResult from '../../../render-result'
import type { NextRequest } from '../../../web/spec-extension/request'

import fresh from 'next/dist/compiled/fresh'
import { normalizeRepeatedSlashes } from '../../../../shared/lib/utils'
import { generateETag } from '../../../lib/etag'
import { getRevalidateCacheControlHeader } from '../../../send-payload/revalidate-headers'
import { fromNodeHeaders, toNodeHeaders } from '../../../web/utils'

type RenderResultToResponseContext = {
  res: MockedResponse
  statusCode: number | undefined
  isResSent: boolean
  isDataReq: boolean | undefined
  isPreviewMode: boolean
}

type RenderResultToResponseModule = {
  dev: boolean | undefined
  hasGetStaticProps: boolean
  definition: RouteDefinition
  basePath: string | undefined
  poweredByHeader: boolean | undefined
  generateEtags: boolean | undefined
}

/**
 * Converts a `RenderResult` into a `Response` object.
 *
 * @param request the request that was made
 * @param result the result to send back to the client
 * @param module the module configuration for the route
 * @param context the context for the request
 * @returns the response to send back to the client
 */
export async function renderResultToResponse(
  request: NextRequest,
  result: RenderResult,
  module: RenderResultToResponseModule,
  context: RenderResultToResponseContext
): Promise<Response> {
  // If the response has already been sent, then just convert the incoming
  // response to a `Response` object and return it.
  if (context.isResSent) {
    return new Response(Buffer.concat(context.res.buffers), {
      status: context.res.statusCode,
      statusText: context.res.statusMessage,
      headers: fromNodeHeaders(context.res.getHeaders()),
    })
  }

  const headers = new Headers()

  const metadata = result.metadata()

  // If we're in dev mode, we shouldn't cache for any reason.
  if (module.dev) {
    headers.set('Cache-Control', 'no-store, must-revalidate')
  }
  // If revalidate is set, we're in development mode or we're rendering a page
  // with getServerSideProps and we're not rendering a data request, we need to
  // set the Cache-Control header.
  else if (typeof metadata.revalidate !== 'undefined' && !context.isDataReq) {
    const header = getRevalidateCacheControlHeader({
      // When the page is 404, Cache-Control should not be added unless we are
      // rendering the 404 page for `notFound: true` which should cache
      // according to revalidate correctly.
      private:
        context.isPreviewMode ||
        (module.definition.page === '/404' && !metadata.isNotFound),
      stateful: module.hasGetStaticProps,
      revalidate: metadata.revalidate,
    })

    headers.set('Cache-Control', header)
  }

  // If this isn't a data request, then add the powered by header if that's
  // enabled.
  if (!context.isDataReq && module.poweredByHeader) {
    headers.set('X-Powered-By', 'Next.js')
  }

  // If this is a redirect, we can return the result immediately.
  if (metadata.isRedirect) {
    // If this is a data request, we need to return the redirect data contained
    // in the page data.
    if (context.isDataReq) {
      // Set the content type to JSON and serialize the redirect object.
      headers.set('Content-Type', 'application/json')
      return new Response(JSON.stringify(metadata.pageData), {
        headers,
      })
    }

    const redirect: Redirect = {
      destination: metadata.pageData.pageProps.__N_REDIRECT,
      statusCode: metadata.pageData.pageProps.__N_REDIRECT_STATUS,
      basePath: metadata.pageData.pageProps.__N_REDIRECT_BASE_PATH,
    }

    // Add in the basePath if it's not already present but configured.
    if (
      module.basePath &&
      redirect.basePath !== false &&
      redirect.destination.startsWith('/')
    ) {
      redirect.destination = `${module.basePath}${redirect.destination}`
    }

    // Normalize repeated slashes.
    if (redirect.destination.startsWith('/')) {
      redirect.destination = normalizeRepeatedSlashes(redirect.destination)
    }

    // Add the location header.
    headers.set('Location', redirect.destination)

    // Return a redirect response.
    return new Response(redirect.destination, {
      status: redirect.statusCode,
      headers,
    })
  }

  // // If this is a not found, we can return the result immediately.
  // if (metadata.isNotFound) {
  //   // FIXME: (wyattjoh) render the 404 page instead of this generic 404 response.
  //   return new Response('Not Found', {
  //     status: 404,
  //   })
  // }

  // Get and set the content type on the response.
  const contentType = result.contentType() || 'text/html; charset=utf-8'
  headers.set('Content-Type', contentType)

  // If the response has a body and it's a stream, then we can pipe the stream
  // directly to the response later.
  const body = result.body
  if (!body) {
    throw new Error(
      "Invariant: 'body' should always be defined for responses that aren't redirects or not found."
    )
  }

  // If the body is a string, we can return the body directly.
  if (typeof body === 'string') {
    // If etag generation is enabled, then we need to generate the etag and
    // check if the request has a matching etag.
    if (module.generateEtags) {
      const etag = generateETag(body)
      headers.set('ETag', etag)

      // If the request has a matching etag, then we can return a 304 response.
      if (
        fresh(
          // When converting from the NextRequest.headers to Node.js headers,
          // the header names are already lowercased.
          toNodeHeaders(request.headers),
          { etag }
        )
      ) {
        return new Response(null, { status: 304, headers })
      }
    }

    // If the response has a body and it's not a stream, then we can set the
    // content length and return the body as the response.
    headers.set('Content-Length', Buffer.byteLength(body).toString())
  }

  // If this was a `HEAD` request, then we can return a response with no body.
  if (request.method === 'HEAD') {
    return new Response(null, { headers })
  }

  // Send back the response. It's either in a string or stream form here.
  // FIXME: (wyattjoh) verify if the body as a stream works correctly.
  return new Response(body, { headers, status: context.statusCode ?? 200 })
}
