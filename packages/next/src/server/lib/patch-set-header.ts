import { getRequestMeta, type NextIncomingMessage } from '../request-meta'
import { parseSetCookie } from '../web/spec-extension/cookies'
import { splitCookiesString } from '../web/utils'

const PATCHED_SET_HEADER = Symbol('next.patchSetHeaderWithCookieSupport')

type PatchableResponse = {
  setHeader(key: string, value: string | string[]): PatchableResponse
  headersSent?: boolean
  [PATCHED_SET_HEADER]?: true
}

function normalizeSetCookieHeader(value: string | string[]): string[] {
  if (typeof value === 'string') {
    return splitCookiesString(value)
  }

  return value.flatMap((cookie) => splitCookiesString(cookie))
}

function getSetCookieKey(cookie: string): string {
  const parsed = parseSetCookie(cookie)

  if (!parsed) {
    return cookie
  }

  return [
    parsed.name,
    parsed.domain?.toLowerCase() ?? '',
    parsed.path ?? '',
  ].join(';')
}

function mergeSetCookieHeadersWithPrecedence(
  middlewareValue: string[] | undefined,
  value: string | string[]
): string[] {
  const cookies = new Map<string, string>()

  for (const cookie of [
    ...(middlewareValue || []),
    ...normalizeSetCookieHeader(value),
  ]) {
    cookies.set(getSetCookieKey(cookie), cookie)
  }

  return Array.from(cookies.values())
}

/**
 * Ensure cookies set in middleware are merged and not overridden by API
 * routes/getServerSideProps.
 *
 * @param req Incoming request
 * @param res Outgoing response
 */
export function patchSetHeaderWithCookieSupport(
  req: NextIncomingMessage,
  res: PatchableResponse
) {
  if (res[PATCHED_SET_HEADER]) {
    return
  }

  const setHeader = res.setHeader.bind(res)

  Object.defineProperty(res, PATCHED_SET_HEADER, {
    value: true,
  })

  res.setHeader = (
    name: string,
    value: string | string[]
  ): PatchableResponse => {
    // When renders /_error after page is failed, it could attempt to set
    // headers after headers.
    if ('headersSent' in res && res.headersSent) {
      return res
    }

    if (name.toLowerCase() === 'set-cookie') {
      const middlewareValue = getRequestMeta(req, 'middlewareCookie')

      if (
        middlewareValue &&
        (!Array.isArray(value) ||
          !value.every((item, idx) => item === middlewareValue[idx]))
      ) {
        value = mergeSetCookieHeadersWithPrecedence(middlewareValue, value)
      }
    }

    return setHeader(name, value)
  }
}
