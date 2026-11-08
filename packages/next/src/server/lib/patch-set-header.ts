import { getRequestMeta, type NextIncomingMessage } from '../request-meta'

const PATCHED_SET_HEADER = Symbol('next.patchSetHeaderWithCookieSupport')

type PatchableResponse = {
  setHeader(key: string, value: string | string[]): PatchableResponse
  headersSent?: boolean
  [PATCHED_SET_HEADER]?: PatchableResponse['setHeader']
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

  // Used twice, because the minifier inlines a single use: V8 allocates a
  // function expression that is assigned to a property in the old generation
  // until it optimizes this function, where it keeps `req` and `res` alive.
  const setHeaderWithCookieSupport = (
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
        value = [
          // TODO: (wyattjoh) find out why this is called multiple times resulting in duplicate cookies being added
          ...new Set([
            ...(middlewareValue || []),
            ...(typeof value === 'string'
              ? [value]
              : Array.isArray(value)
                ? value
                : []),
          ]),
        ]
      }
    }

    return setHeader(name, value)
  }

  Object.defineProperty(res, PATCHED_SET_HEADER, {
    value: setHeaderWithCookieSupport,
  })

  res.setHeader = setHeaderWithCookieSupport
}
