import { brotliCompressSync, deflateSync, gzipSync } from 'node:zlib'
import { decodePostponedRequestBody } from './postponed-request-body'

describe('decodePostponedRequestBody', () => {
  // A representative serialized postponed state (always starts with `<len>:`).
  const state = '4:null'

  it('returns the body as UTF-8 when there is no content-encoding', () => {
    expect(decodePostponedRequestBody(Buffer.from(state), undefined)).toBe(state)
  })

  it('returns the body as UTF-8 for the identity encoding', () => {
    expect(decodePostponedRequestBody(Buffer.from(state), 'identity')).toBe(
      state
    )
  })

  it('decompresses a gzip-encoded body', () => {
    expect(decodePostponedRequestBody(gzipSync(Buffer.from(state)), 'gzip')).toBe(
      state
    )
  })

  it('decompresses a br-encoded body', () => {
    expect(
      decodePostponedRequestBody(brotliCompressSync(Buffer.from(state)), 'br')
    ).toBe(state)
  })

  it('decompresses a deflate-encoded body', () => {
    expect(
      decodePostponedRequestBody(deflateSync(Buffer.from(state)), 'deflate')
    ).toBe(state)
  })

  it('handles a header provided as an array', () => {
    expect(
      decodePostponedRequestBody(gzipSync(Buffer.from(state)), ['gzip'])
    ).toBe(state)
  })

  it('is case-insensitive about the encoding', () => {
    expect(decodePostponedRequestBody(gzipSync(Buffer.from(state)), 'GZIP')).toBe(
      state
    )
  })

  // The production-realistic case: a proxy gzips the resume body but does not
  // forward `Content-Encoding`. The leading gzip magic number is detected so
  // the body is still decompressed rather than read as UTF-8 garbage.
  it('decompresses a gzip body even when content-encoding is absent', () => {
    expect(
      decodePostponedRequestBody(gzipSync(Buffer.from(state)), undefined)
    ).toBe(state)
  })

  it('leaves a plain UTF-8 body untouched (no false gzip detection)', () => {
    const plain = '12:{"some":"state"}'
    expect(decodePostponedRequestBody(Buffer.from(plain), undefined)).toBe(plain)
  })

  // Regression: previously the gzip bytes were read as UTF-8 without
  // decompression, producing a non-`<len>:` string that parsePostponedState
  // rejects as "Invariant: invalid postponed state".
  it('round-trips so the decoded gzip body is a valid postponed-state string', () => {
    const decoded = decodePostponedRequestBody(
      gzipSync(Buffer.from(state)),
      'gzip'
    )
    expect(decoded).toMatch(/^[0-9]+:/)
  })
})
