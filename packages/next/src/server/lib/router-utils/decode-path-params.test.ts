/* eslint-env jest */

import { decodePathParams } from './decode-path-params'

describe('decoding path params', () => {
  it('should decode path params', () => {
    const decodedPathParams = decodePathParams('sticks%20%26%20stones')
    expect(decodedPathParams).toBe('sticks & stones')
  })

  it('should throw an error when the path param is improperly encoded', () => {
    try {
      // The segment %ZZ is an invalid percent-encoded sequence
      // because %ZZ does not represent a valid hexadecimal character.
      decodePathParams('sticks%ZZ%ZZ%ZZstones')
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toBe('Failed to decode path param(s).')
    }
  })
})
