import type { IncomingHttpHeaders } from 'http'
import {
  isInvalidFlightRouterStateError,
  parseRequestHeaders,
} from './parse-request-headers'
import { parseAndValidateFlightRouterState } from '../../app-render/parse-and-validate-flight-router-state'

jest.mock('../../app-render/parse-and-validate-flight-router-state', () => {
  const actual = jest.requireActual(
    '../../app-render/parse-and-validate-flight-router-state'
  )
  return {
    ...actual,
    parseAndValidateFlightRouterState: jest.fn(
      actual.parseAndValidateFlightRouterState
    ),
  }
})

const parseSpy = jest.mocked(parseAndValidateFlightRouterState)

beforeEach(() => {
  parseSpy.mockClear()
})

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

const options = { isRoutePPREnabled: false, previewModeId: undefined }

function rscHeaders(
  stateTree: string | string[] | undefined,
  extra: IncomingHttpHeaders = {}
): IncomingHttpHeaders {
  return { rsc: '1', 'next-router-state-tree': stateTree, ...extra }
}

function getParseError(headers: IncomingHttpHeaders, opts = options) {
  try {
    parseRequestHeaders(headers, opts)
  } catch (err) {
    return err
  }
  throw new Error('Expected parseRequestHeaders to throw')
}

describe('parseRequestHeaders router state', () => {
  it('parses a valid header once', () => {
    expect(
      parseRequestHeaders(rscHeaders(validTree), options).flightRouterState
    ).toEqual(JSON.parse(decodeURIComponent(validTree)))
    expect(parseSpy).toHaveBeenCalledTimes(1)
  })

  it('accepts a missing header', () => {
    expect(
      parseRequestHeaders({ rsc: '1' }, options).flightRouterState
    ).toBeUndefined()
  })

  it.each([
    [
      'a header from an older Next.js version',
      legacyTree,
      'The router state header was sent but could not be parsed.',
    ],
    [
      'malformed JSON',
      '%5B',
      'The router state header was sent but could not be parsed.',
    ],
    [
      'a schema mismatch',
      encodeURIComponent(JSON.stringify(['', ''])),
      'The router state header was sent but could not be parsed.',
    ],
    [
      'a malformed URI encoding',
      '%E0%A4%A',
      'The router state header was sent but could not be parsed.',
    ],
    [
      'a header that is too large',
      'a'.repeat(20 * 2000 + 1),
      'The router state header was too large.',
    ],
    [
      'a header sent multiple times',
      [validTree, validTree],
      'Multiple router state headers were sent. This is not allowed.',
    ],
  ])('rejects %s as invalid client input', (_, stateTree, message) => {
    const err = getParseError(rscHeaders(stateTree))
    expect(isInvalidFlightRouterStateError(err)).toBe(true)
    expect((err as Error).message).toBe(message)
    expect(parseSpy).toHaveBeenCalledTimes(1)
  })

  it('ignores the header on non-RSC requests', () => {
    expect(
      parseRequestHeaders({ 'next-router-state-tree': legacyTree }, options)
        .flightRouterState
    ).toBeUndefined()
    expect(parseSpy).not.toHaveBeenCalled()
  })

  it('ignores the header on prefetches of PPR-enabled routes', () => {
    const headers = rscHeaders(legacyTree, { 'next-router-prefetch': '1' })
    expect(
      parseRequestHeaders(headers, { ...options, isRoutePPREnabled: true })
        .flightRouterState
    ).toBeUndefined()
    expect(parseSpy).not.toHaveBeenCalled()
    expect(isInvalidFlightRouterStateError(getParseError(headers))).toBe(true)
  })
})

describe('isInvalidFlightRouterStateError', () => {
  it('recognizes the error by its code, not its class', () => {
    // Errors may be thrown and caught by different bundle layers, each with
    // its own copy of the error class.
    const err = Object.assign(new Error('x'), {
      code: 'NEXT_INVALID_FLIGHT_ROUTER_STATE',
    })
    expect(isInvalidFlightRouterStateError(err)).toBe(true)
  })

  it.each([
    ['an ordinary error', new Error('The router state header was too large.')],
    ['an error with another code', Object.assign(new Error(), { code: 'X' })],
    ['a string', 'NEXT_INVALID_FLIGHT_ROUTER_STATE'],
    ['null', null],
    ['undefined', undefined],
  ])('is false for %s', (_, value) => {
    expect(isInvalidFlightRouterStateError(value)).toBe(false)
  })
})
