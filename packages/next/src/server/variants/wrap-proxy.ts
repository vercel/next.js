import type { NextRequest } from '../web/spec-extension/request'

import { NEXT_VARIANTS_DECORATION_HEADER } from '../../lib/constants'
import { NextResponse } from '../web/spec-extension/response'
import {
  assertValidVariantValue,
  getVariantDecide,
  getVariantKey,
  isVariant,
} from '../request/variants'
import { canonicalizeVariants } from './hash'

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
 * Resolved values are handed to the edge adapter through
 * `NEXT_VARIANTS_DECORATION_HEADER` rather than applied here, so that the
 * adapter can compute the client-facing rewrite headers against the honest
 * destination before decorating it.
 */
export function wrapProxy(
  variantsModule: Record<string, unknown>,
  userProxy?: UserProxy
) {
  return async function proxy(request: NextRequest): Promise<Response> {
    const response =
      (userProxy ? await userProxy(request) : undefined) ?? NextResponse.next()

    // A redirect means no route of ours renders this request, so there is no
    // variant to resolve. A *rewrite* is not skipped: the rewritten route is
    // the one that will be served, and the adapter decorates that destination.
    //
    // TODO(variants): once the per-route resolution table exists, the rewrite
    // target must also select *which* variants apply, per the design. Until
    // then every exported variant is resolved regardless of route, so reading
    // the target would change nothing.
    if (
      response.headers.has('x-middleware-redirect') ||
      response.headers.has('location')
    ) {
      return response
    }

    const values = await resolveVariants(variantsModule, request)
    if (values === null) {
      return response
    }

    response.headers.set(NEXT_VARIANTS_DECORATION_HEADER, values)

    return response
  }
}

/**
 * Resolves every variant exported by the module into the canonical packed form,
 * or `null` when the module exports no variants.
 *
 * Values are validated here, where they are produced, so that a rejected value
 * names the variant that produced it rather than failing later during routing.
 *
 * `canonicalizeVariants` owns the ordering because the build addresses the same
 * combinations by the same form when it emits prerendered variant paths.
 */
async function resolveVariants(
  variantsModule: Record<string, unknown>,
  request: NextRequest
): Promise<string | null> {
  const values: Record<string, string> = {}

  for (const exported of Object.values(variantsModule)) {
    if (!isVariant(exported)) {
      continue
    }

    const key = getVariantKey(exported)
    const value = await getVariantDecide(exported)(request)

    values[key] = assertValidVariantValue(key, value, 'decide')
  }

  if (Object.keys(values).length === 0) {
    return null
  }

  return canonicalizeVariants(values)
}
