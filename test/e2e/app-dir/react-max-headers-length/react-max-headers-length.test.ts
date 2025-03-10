import { nextTestSetup } from 'e2e-utils'

const LINK_HEADER_SIZE = 111

/**
 * Calculates the minimum header length that will be emitted by the server. This
 * is calculated by taking the maximum header length and dividing it by the
 * average header size including joining `, ` characters.
 *
 * @param maxLength the maximum header length
 * @returns the minimum header length
 */
function calculateMinHeaderLength(maxLength) {
  const averageHeaderSize = LINK_HEADER_SIZE + 2
  return Math.floor(maxLength / averageHeaderSize) * averageHeaderSize - 2
}

describe('react-max-headers-length', () => {
  describe.each([0, 400, undefined, 10000])(
    'reactMaxHeadersLength = %s',
    (reactMaxHeadersLength) => {
      const env: Record<string, string> = {}
      if (typeof reactMaxHeadersLength === 'number') {
        env.TEST_REACT_MAX_HEADERS_LENGTH = reactMaxHeadersLength.toString()
      }

      const { next } = nextTestSetup({ files: __dirname, env })

      it('should respect reactMaxHeadersLength', async () => {
        const res = await next.fetch('/')
        expect(res.status).toBe(200)

        // React currently only sets the `Link` header, so we should check to
        // see that the length of the header has respected the configured
        // value.
        const header = res.headers.get('Link')
        if (reactMaxHeadersLength === undefined) {
          // This is the default case.
          expect(header).not.toBeNull()
          expect(header).toBeString()

          expect(header.length).toBeGreaterThanOrEqual(
            calculateMinHeaderLength(6000)
          )
          expect(header.length).toBeLessThanOrEqual(6000)
        } else if (reactMaxHeadersLength === 0) {
          // This is the case where the header is not emitted.
          expect(header).toBeNull()
        } else if (typeof reactMaxHeadersLength === 'number') {
          // This is the case where the header is emitted and the length is
          // respected.
          expect(header).not.toBeNull()
          expect(header).toBeString()

          expect(header.length).toBeGreaterThanOrEqual(
            calculateMinHeaderLength(reactMaxHeadersLength)
          )
          expect(header.length).toBeLessThanOrEqual(reactMaxHeadersLength)
        }
      })
    }
  )
})
