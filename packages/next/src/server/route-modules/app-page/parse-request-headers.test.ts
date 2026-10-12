import type { IncomingHttpHeaders } from 'http'
import {
  hasInvalidFlightRouterStateHeader,
  parseRequestHeaders,
} from './parse-request-headers'

const validTree = encodeURIComponent(
  JSON.stringify([
    '',
    {
      children: [['slug', 'foo', 'd', null], { children: ['__PAGE__', {}] }],
    },
  ])
)

// Next.js 15 encoded dynamic segments as a 3-tuple and sent a boolean
// `isRootLayout` flag at index 4.
const legacyTree = encodeURIComponent(
  JSON.stringify([
    '',
    {
      children: [
        ['slug', 'foo', 'd'],
        { children: ['__PAGE__', {}] },
        null,
        null,
      ],
    },
    null,
    null,
    true,
  ])
)

function rscHeaders(
  stateTree: string | string[] | undefined,
  extra: IncomingHttpHeaders = {}
): IncomingHttpHeaders {
  return { rsc: '1', 'next-router-state-tree': stateTree, ...extra }
}

describe('hasInvalidFlightRouterStateHeader', () => {
  const options = { isRoutePPREnabled: false }

  it('accepts a valid header', () => {
    expect(
      hasInvalidFlightRouterStateHeader(rscHeaders(validTree), options)
    ).toBe(false)
  })

  it('accepts a missing header', () => {
    expect(hasInvalidFlightRouterStateHeader({ rsc: '1' }, options)).toBe(false)
  })

  it.each([
    ['a header from an older Next.js version', legacyTree],
    ['malformed JSON', '%5B'],
    ['a schema mismatch', encodeURIComponent(JSON.stringify(['', '']))],
    ['a malformed URI encoding', '%E0%A4%A'],
    ['a header that is too large', 'a'.repeat(20 * 2000 + 1)],
    ['a header sent multiple times', [validTree, validTree]],
  ])('rejects %s', (_, stateTree) => {
    expect(
      hasInvalidFlightRouterStateHeader(rscHeaders(stateTree), options)
    ).toBe(true)
  })

  it('ignores the header on non-RSC requests', () => {
    expect(
      hasInvalidFlightRouterStateHeader(
        { 'next-router-state-tree': legacyTree },
        options
      )
    ).toBe(false)
  })

  it('ignores the header on prefetches of PPR-enabled routes', () => {
    const headers = rscHeaders(legacyTree, { 'next-router-prefetch': '1' })
    expect(
      hasInvalidFlightRouterStateHeader(headers, { isRoutePPREnabled: true })
    ).toBe(false)
    expect(
      hasInvalidFlightRouterStateHeader(headers, { isRoutePPREnabled: false })
    ).toBe(true)
  })

  it('agrees with parseRequestHeaders', () => {
    const parseOptions = { isRoutePPREnabled: false, previewModeId: undefined }

    expect(
      parseRequestHeaders(rscHeaders(validTree), parseOptions).flightRouterState
    ).toBeDefined()
    expect(() =>
      parseRequestHeaders(rscHeaders(legacyTree), parseOptions)
    ).toThrow('The router state header was sent but could not be parsed.')
  })
})
