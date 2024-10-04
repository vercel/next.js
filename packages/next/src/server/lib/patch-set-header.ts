import { getRequestMeta, type NextIncomingMessage } from '../request-meta'

type PatchableResponse = {
  setHeader(key: string, value: string | string[]): PatchableResponse
}

/**
 * Ensure cookies set in middleware are merged and not overridden by API
 * routes/getServerSideProps. Since middleware always runs before API routes
 * and actions, any duplicate cookie set downstream are given priority
 * and overlapping cookie names set by middleware are be removed.
 *
 * @param req Incoming request
 * @param res Outgoing response
 */
export function patchSetHeaderWithCookieSupport(
  req: NextIncomingMessage,
  res: PatchableResponse
) {
  const setHeader = res.setHeader.bind(res)
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
        !middlewareValue ||
        !Array.isArray(value) ||
        !value.every((item, idx) => item === middlewareValue[idx])
      ) {
        let valueAsArray: string[] =
          typeof value === 'string'
            ? [value]
            : Array.isArray(value)
              ? value
              : []

        // this step is necessary because when merging cookies in send-response.ts
        // the "value" argument will contain the cookies set by the middleware
        // so we remove those in this step by exact match
        valueAsArray = valueAsArray.filter(
          (cookie) => !middlewareValue?.includes(cookie)
        )
        const cookieNamesToSet = new Set<string>()
        for (const cookie of valueAsArray) {
          const [cookieName] = cookie.split('=')
          cookieNamesToSet.add(cookieName.trim())
        }

        const middlewareCookiesToSet = []
        for (const mwCookie of middlewareValue || []) {
          const [cookieName] = mwCookie.split('=')
          if (!cookieNamesToSet.has(cookieName.trim())) {
            middlewareCookiesToSet.push(mwCookie)
          }
        }

        value = [
          // TODO: (wyattjoh) find out why this is called multiple times resulting in duplicate cookies being added
          ...new Set([...middlewareCookiesToSet, ...valueAsArray]),
        ]
      }
    }

    return setHeader(name, value)
  }
}
