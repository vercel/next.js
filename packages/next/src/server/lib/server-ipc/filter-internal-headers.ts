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
  headers: Record<string, undefined | string | string[]>,
  expectedSubrequestHeaderIdBuffer: Buffer
) => {
  const subrequestIdHeader = headers['x-middleware-subrequest-id']
  const subrequestIdBuffer = Buffer.from(
    typeof subrequestIdHeader === 'string' ? subrequestIdHeader : '',
    'hex'
  )

  for (const header in headers) {
    if (INTERNAL_HEADERS.includes(header)) {
      delete headers[header]
    }

    // If this request didn't origin from this session we filter
    // out the "x-middleware-subrequest" header so we don't skip
    // middleware incorrectly
    if (
      header === 'x-middleware-subrequest' &&
      // timingSafeEqual requires buffers be same length
      (subrequestIdBuffer.byteLength !==
        expectedSubrequestHeaderIdBuffer.byteLength ||
        !crypto.timingSafeEqual(
          subrequestIdBuffer,
          expectedSubrequestHeaderIdBuffer
        ))
    ) {
      delete headers['x-middleware-subrequest']
    }
  }
}
