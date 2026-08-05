import type { NextRequest } from '../web/spec-extension/request'
import type { Variant } from '../request/variants'
import type { VariantsByRoute } from './route-variants'

import { NEXT_VARIANTS_HEADER } from '../../lib/constants'
import { NextResponse } from '../web/spec-extension/response'
import {
  assertValidVariantValue,
  getVariantDecide,
  getVariantKey,
} from '../request/variants'
import { compileRouteVariants, findVariantsForPathname } from './route-variants'
import { getProxyTarget } from './target'
import { encodeVariants } from './hash'

type ProxyResult = Response | undefined | null | void

type UserProxy = (request: NextRequest) => ProxyResult | Promise<ProxyResult>

/**
 * Wraps the user's proxy so that variants are resolved for each request.
 *
 * The user's proxy runs *first*, because its rewrite determines which route
 * will actually be served, and therefore which variants apply. `userProxy` is
 * absent when the project has no `proxy.ts`; that is simply the empty case, so
 * nothing is synthesized to stand in for it.
 *
 * Resolved values are handed to the edge adapter through `NEXT_VARIANTS_HEADER`
 * rather than applied here, so that the adapter can compute the client-facing
 * rewrite headers against the honest destination before decorating it.
 *
 * TODO(variants): resolution belongs in the edge adapter, which already derives
 * the target and matches it against the declared combinations. It lives here
 * only while `decide` still takes the request. Once it takes `params` instead,
 * resolving a variant needs the route match that produces them, and doing that
 * here would mean matching the route and extracting its params in the proxy
 * wrapper while the adapter does the same thing immediately afterwards. At that
 * point this function keeps only the user's proxy and hands the table through,
 * and the response-header round trip below goes away with it.
 */
export function wrapProxy(
  variantsByRoute: VariantsByRoute,
  userProxy?: UserProxy
) {
  const matchers = compileRouteVariants(variantsByRoute)

  return async function proxy(request: NextRequest): Promise<Response> {
    const response =
      (userProxy ? await userProxy(request) : undefined) ?? NextResponse.next()

    // A redirect means no route of ours renders this request, so there is no
    // variant to resolve. A *rewrite* is not skipped: the rewritten route is
    // the one that will be served, and the adapter decorates that destination.
    if (
      response.headers.has('x-middleware-redirect') ||
      response.headers.has('location')
    ) {
      return response
    }

    const target = getProxyTarget(new URL(request.url), response)

    if (!target) {
      return response
    }

    const values = await resolveVariants(
      findVariantsForPathname(matchers, target.pathname),
      request
    )

    if (values === null) {
      return response
    }

    response.headers.set(NEXT_VARIANTS_HEADER, values)

    return response
  }
}

/**
 * Resolves the given variants into their transport encoding, or `null` when
 * there are none.
 *
 * Values are validated here, where they are produced, so that a rejected value
 * names the variant that produced it rather than failing later during routing.
 */
async function resolveVariants(
  variants: ReadonlyArray<Variant>,
  request: NextRequest
): Promise<string | null> {
  if (variants.length === 0) {
    return null
  }

  const values: Record<string, string> = {}

  for (const variant of variants) {
    const key = getVariantKey(variant)
    const value = await getVariantDecide(variant)(request)

    values[key] = assertValidVariantValue(key, value, 'decide')
  }

  return encodeVariants(values)
}
