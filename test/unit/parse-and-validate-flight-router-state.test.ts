/* eslint-env jest */
import { parseAndValidateFlightRouterState } from 'next/dist/server/app-render/parse-and-validate-flight-router-state'
import { DecodeError } from 'next/dist/shared/lib/utils'

describe('parseAndValidateFlightRouterState', () => {
  it('should return undefined when header is undefined', () => {
    expect(parseAndValidateFlightRouterState(undefined)).toBeUndefined()
  })

  it('should parse valid encoded router state tree', () => {
    const state = ['', { children: ['', {}] }]
    const encoded = encodeURIComponent(JSON.stringify(state))
    expect(parseAndValidateFlightRouterState(encoded)).toEqual(state)
  })

  it('should throw DecodeError when multiple router state headers are sent', () => {
    expect(() => parseAndValidateFlightRouterState(['', {}] as any)).toThrow(
      DecodeError
    )
    expect(() => parseAndValidateFlightRouterState(['', {}] as any)).toThrow(
      'Multiple router state headers were sent. This is not allowed.'
    )
  })

  it('should throw DecodeError when header is too large', () => {
    const oversized = 'a'.repeat(20 * 2000 + 1)
    expect(() => parseAndValidateFlightRouterState(oversized)).toThrow(
      DecodeError
    )
    expect(() => parseAndValidateFlightRouterState(oversized)).toThrow(
      'The router state header was too large.'
    )
  })

  it('should throw DecodeError when header is unparseable malformed string', () => {
    expect(() => parseAndValidateFlightRouterState('xyzzy')).toThrow(
      DecodeError
    )
    expect(() => parseAndValidateFlightRouterState('xyzzy')).toThrow(
      'The router state header was sent but could not be parsed.'
    )

    expect(() => parseAndValidateFlightRouterState('')).toThrow(DecodeError)
    expect(() => parseAndValidateFlightRouterState('["",{')).toThrow(
      DecodeError
    )
  })

  it('should throw DecodeError when header is valid JSON but does not match schema', () => {
    const invalidSchema1 = encodeURIComponent(JSON.stringify({ a: 1 }))
    expect(() => parseAndValidateFlightRouterState(invalidSchema1)).toThrow(
      DecodeError
    )
    expect(() => parseAndValidateFlightRouterState(invalidSchema1)).toThrow(
      'The router state header was sent but could not be parsed.'
    )

    const invalidSchema2 = encodeURIComponent(JSON.stringify(['', '']))
    expect(() => parseAndValidateFlightRouterState(invalidSchema2)).toThrow(
      DecodeError
    )
  })
})
