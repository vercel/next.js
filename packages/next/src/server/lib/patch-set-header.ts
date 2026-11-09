import { getRequestMeta, type NextIncomingMessage } from '../request-meta'

const PATCHED_SET_HEADER = Symbol('next.patchSetHeaderWithCookieSupport')

type PatchableResponse = {
  setHeader(key: string, value: string | string[]): PatchableResponse
  headersSent?: boolean
  [PATCHED_SET_HEADER]?: true
}

type PatchedSetHeaderState = {
  req: NextIncomingMessage
  res: PatchableResponse
  setHeader: PatchableResponse['setHeader']
}

function setHeaderWithCookieSupport(
  this: PatchedSetHeaderState,
  name: string,
  value: string | string[]
): PatchableResponse {
  const { req, res } = this

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

  return this.setHeader(name, value)
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

  // The replacement is a bound function instead of a closure created here.
  // V8 allocates a function literal that is assigned to a property in the old
  // generation, on the assumption that it is a long-lived method. For a
  // function created for every request that is costly: the function is only
  // reclaimed by a major GC, and until then it keeps what it closes over (the
  // request, the response and everything they reference) alive through every
  // scavenge.
  res.setHeader = setHeaderWithCookieSupport.bind({ req, res, setHeader })
}
