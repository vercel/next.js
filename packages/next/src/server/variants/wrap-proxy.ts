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
import { getProxyTarget, getTargetRoutePathname } from './target'
import { encodeVariants } from './encoding'

type ProxyResult = Response | undefined | null | void

type UserProxy = (request: NextRequest) => ProxyResult | Promise<ProxyResult>

/**
 * Wraps the proxy of the user, and resolves the variants of each request.
 *
 * The proxy of the user runs first. Its rewrite decides which route serves the
 * request, and therefore which variants apply. `userProxy` is absent when the
 * project has no `proxy.ts`. That case needs no substitute, because this
 * function then resolves variants and nothing else.
 *
 * This function sets the resolved values on its response, in
 * `NEXT_VARIANTS_HEADER`, and the edge adapter sends them to the origin. The
 * adapter computes the rewrite headers that a client reads, and it does that
 * from the destination the proxy chose.
 *
 * TODO(variants): resolution belongs in the edge adapter, which already derives
 * the target. It is here only while `decide` takes the request. Once `decide`
 * takes the params of a route, resolving a variant needs the route match that
 * produces them, and to do that here would mean matching the route in this
 * wrapper while the adapter does the same work immediately afterwards. At that
 * point this function keeps only the proxy of the user and passes the table
 * through, and the response header goes away with it.
 */
export function wrapProxy(
  variantsByRoute: VariantsByRoute,
  userProxy?: UserProxy
) {
  const matchers = compileRouteVariants(variantsByRoute)

  return async function proxy(request: NextRequest): Promise<Response> {
    const response =
      (userProxy ? await userProxy(request) : undefined) ?? NextResponse.next()

    // A redirect sends the client elsewhere, so no route renders this request
    // and no variant applies to it. A rewrite is different. The rewritten route
    // is the one that serves the request, so resolution continues below.
    if (
      response.headers.has('x-middleware-redirect') ||
      response.headers.has('location')
    ) {
      return response
    }

    // A rewrite decides which route renders, and each route reads its own
    // variants. Resolution therefore uses the target of the proxy, and not the
    // incoming path. A target on another origin renders no route of this
    // application, so it has no variants to resolve.
    const target = getProxyTarget(new URL(request.url), response)

    if (!target) {
      return response
    }

    // The table is keyed by route, and a route carries no base path, while the
    // target does.
    const values = await resolveVariants(
      findVariantsForPathname(
        matchers,
        getTargetRoutePathname(target.pathname, request.nextUrl.basePath)
      ),
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
 * Resolves the given variants and encodes them for transport. The result is
 * null when the list is empty.
 *
 * This function validates each value at the point that produces it, so that the
 * error names the variant whose `decide` returned it. A validation further down
 * could only report the request.
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

    values[key] = assertValidVariantValue(key, value)
  }

  return encodeVariants(values)
}
