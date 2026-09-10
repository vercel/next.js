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
import { encodeVariants } from './hash'

type ProxyResult = Response | undefined | null | void

type UserProxy = (request: NextRequest) => ProxyResult | Promise<ProxyResult>

/**
 * Wraps the proxy of the user, so that variants are resolved for each request.
 *
 * The proxy of the user runs first, because its rewrite decides which route
 * will be served, and therefore which variants apply. `userProxy` is absent
 * when the project has no `proxy.ts`. That is the empty case, and nothing is
 * synthesized to stand in for it.
 *
 * This function hands the resolved values to the edge adapter in
 * `NEXT_VARIANTS_HEADER`, and does not apply them here. The adapter can then
 * compute the rewrite headers the client reads against the true destination,
 * before it adds the prefix to that destination.
 *
 * TODO(variants): resolution belongs in the edge adapter, which already derives
 * the target and matches it against the declared combinations. It is here only
 * while `decide` still takes the request. Once `decide` takes `params`,
 * resolving a variant needs the route match that produces them. To do that here
 * would mean matching the route and extracting its params in this wrapper,
 * while the adapter does the same work immediately afterwards. At that point
 * this function keeps only the proxy of the user and passes the table through,
 * and the response header below goes away with it.
 */
export function wrapProxy(
  variantsByRoute: VariantsByRoute,
  userProxy?: UserProxy
) {
  const matchers = compileRouteVariants(variantsByRoute)

  return async function proxy(request: NextRequest): Promise<Response> {
    const response =
      (userProxy ? await userProxy(request) : undefined) ?? NextResponse.next()

    // A redirect means that no route of ours renders this request, so there is
    // no variant to resolve. A rewrite is different, and this code does not
    // skip it: the rewritten route is the one that will be served, and the
    // adapter adds the prefix to that destination.
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
 * Resolves the given variants into their transport encoding. The result is
 * `null` when there are none.
 *
 * This function validates each value where it is produced, so that a rejected
 * value names the variant that produced it. Otherwise the failure would come
 * later, during routing.
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
