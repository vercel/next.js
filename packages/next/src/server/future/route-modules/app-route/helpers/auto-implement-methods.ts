import type { AppRouteHandlerFn, AppRouteHandlers } from '../module'

import { HTTP_METHODS, type HTTP_METHOD } from '../../../../web/http'
import { handleMethodNotAllowedResponse } from '../../helpers/response-handlers'

const AUTOMATIC_ROUTE_METHODS = ['HEAD', 'OPTIONS'] as const

export function autoImplementMethods(
  handlers: AppRouteHandlers
): Record<HTTP_METHOD, AppRouteHandlerFn> {
  // Loop through all the HTTP methods to create the initial methods object.
  // Each of the methods will be set to the the 405 response handler.
  const methods: Record<HTTP_METHOD, AppRouteHandlerFn> = HTTP_METHODS.reduce(
    (acc, method) => ({
      ...acc,
      // If the userland module implements the method, then use it. Otherwise,
      // use the 405 response handler.
      [method]: handlers[method] ?? handleMethodNotAllowedResponse,
    }),
    {} as Record<HTTP_METHOD, AppRouteHandlerFn>
  )

  // Get all the methods that could be automatically implemented that were not
  // implemented by the userland module.
  const implemented = new Set(HTTP_METHODS.filter((method) => handlers[method]))
  const missing = AUTOMATIC_ROUTE_METHODS.filter(
    (method) => !implemented.has(method)
  )

  // Loop over the missing methods to automatically implement them if we can.
  for (const method of missing) {
    // If the userland module doesn't implement the HEAD method, then
    // we'll automatically implement it by calling the GET method (if it
    // exists).
    if (method === 'HEAD') {
      // If the userland module doesn't implement the GET method, then
      // we're done.
      if (!handlers.GET) break

      // Implement the HEAD method by calling the GET method.
      methods.HEAD = handlers.GET

      // Mark it as implemented.
      implemented.add('HEAD')

      continue
    }

    // If OPTIONS is not provided then implement it.
    if (method === 'OPTIONS') {
      // TODO: check if HEAD is implemented, if so, use it to add more headers

      // Get all the methods that were implemented by the userland module.
      const allow: HTTP_METHOD[] = ['OPTIONS', ...implemented]

      // If the list of methods doesn't include HEAD, but it includes GET, then
      // add HEAD as it's automatically implemented.
      if (!implemented.has('HEAD') && implemented.has('GET')) {
        allow.push('HEAD')
      }

      // Sort and join the list with commas to create the `Allow` header. See:
      // https://httpwg.org/specs/rfc9110.html#field.allow
      const headers = { Allow: allow.sort().join(', ') }

      // Implement the OPTIONS method by returning a 204 response with the
      // `Allow` header.
      methods.OPTIONS = () => new Response(null, { status: 204, headers })

      // Mark this method as implemented.
      implemented.add('OPTIONS')

      continue
    }

    throw new Error(
      `Invariant: should handle all automatic implementable methods, got method: ${method}`
    )
  }

  return methods
}
