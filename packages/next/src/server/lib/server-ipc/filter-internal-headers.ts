import crypto from 'crypto'

// These are headers that are only used internally and should
// not be honored from the external request
const INTERNAL_HEADERS = [
  'x-middleware-rewrite',
  'x-middleware-redirect',
  'x-middleware-set-cookie',
  'x-middleware-skip',
  'x-middleware-override-headers',
  'x-middleware-next',
  'x-now-route-matches',
  'x-matched-path',
]

export const filterInternalHeaders = (
  headers: Record<string, undefined | string | string[]>
) => {
  const subrequestIdHeader = headers['x-middleware-subrequest-id']

  for (const header in headers) {
    if (INTERNAL_HEADERS.includes(header)) {
      delete headers[header]
    }

    // If this request didn't origin from this session we filter
    // out the "x-middleware-subrequest" header so we don't skip
    // middleware incorrectly
    if (
      header === 'x-middleware-subrequest' &&
      !crypto.timingSafeEqual(
        Buffer.from(
          typeof subrequestIdHeader === 'string' ? subrequestIdHeader : ''
        ),
        Buffer.from(
          (globalThis as any)[Symbol.for('@next/middleware-subrequest-id')] ||
            ''
        )
      )
    ) {
      delete headers['x-middleware-subrequest']
    }
  }
}
