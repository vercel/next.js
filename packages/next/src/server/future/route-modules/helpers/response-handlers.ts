import { appendMutableCookies } from '../../../web/spec-extension/adapters/request-cookies'
import type { ResponseCookies } from '../../../web/spec-extension/cookies'

export function handleRedirectResponse(
  url: string,
  mutableCookies: ResponseCookies,
  status: number
): Response {
  const headers = new Headers({ location: url })

  appendMutableCookies(headers, mutableCookies)

  return new Response(null, { status, headers })
}

export function handleBadRequestResponse(): Response {
  return new Response(null, { status: 400 })
}

export function handleNotFoundResponse(): Response {
  return new Response(null, { status: 404 })
}

export function handleMethodNotAllowedResponse(): Response {
  return new Response(null, { status: 405 })
}

export function handleInternalServerErrorResponse(): Response {
  return new Response(null, { status: 500 })
}
