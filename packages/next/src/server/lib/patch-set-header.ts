import { getRequestMeta, type NextIncomingMessage } from '../request-meta'

const PATCHED_SET_HEADER = Symbol('next.patchSetHeaderWithCookieSupport')

type PatchableResponse = {
  setHeader(key: string, value: string | string[]): PatchableResponse
  headersSent?: boolean
  [PATCHED_SET_HEADER]?: true
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

  Object.defineProperty(res, PATCHED_SET_HEADER, {
    value: true,
  })

  // A bound function, not a function expression. V8 allocates a function
  // expression that is assigned to a property in the old generation until
  // TurboFan has optimized the function that creates it, which takes thousands
  // of requests. There it would keep `req` and `res` alive until the next
  // major garbage collection.
  res.setHeader = setHeaderWithCookieSupport.bind(res, req, res.setHeader)
}

function setHeaderWithCookieSupport(
  this: PatchableResponse,
  req: NextIncomingMessage,
  setHeader: PatchableResponse['setHeader'],
  name: string,
  value: string | string[]
): PatchableResponse {
  // When renders /_error after page is failed, it could attempt to set
  // headers after headers.
  if ('headersSent' in this && this.headersSent) {
    return this
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

  return setHeader.call(this, name, value)
}
