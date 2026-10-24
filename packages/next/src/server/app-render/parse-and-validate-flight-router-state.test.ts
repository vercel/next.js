import { DecodeError } from '../../shared/lib/utils'
import { parseAndValidateFlightRouterState } from './parse-and-validate-flight-router-state'

describe('parseAndValidateFlightRouterState', () => {
  it('should return undefined when stateHeader is undefined', () => {
    expect(parseAndValidateFlightRouterState(undefined)).toBeUndefined()
  })

  it('should parse a valid flight router state header', () => {
    const validState = [['', 'b', 'c', null], {}]
    const encoded = encodeURIComponent(JSON.stringify(validState))
    const result = parseAndValidateFlightRouterState(encoded)
    expect(result).toEqual(validState)
  })

  it('should throw DecodeError for multiple headers (array)', () => {
    expect(() => parseAndValidateFlightRouterState(['a', 'b'])).toThrow(
      DecodeError
    )
  })

  it('should throw DecodeError when header is too large', () => {
    const oversized = 'x'.repeat(20 * 2000 + 1)
    expect(() => parseAndValidateFlightRouterState(oversized)).toThrow(
      DecodeError
    )
  })

  it('should throw DecodeError for invalid JSON', () => {
    expect(() => parseAndValidateFlightRouterState('not-valid-json')).toThrow(
      DecodeError
    )
  })

  it('should throw DecodeError for valid JSON that fails schema validation', () => {
    // Simulates v14 schema with boolean 5th element instead of number
    const v14State = [['', 'b', 'c', null], {}, null, null, true]
    const encoded = encodeURIComponent(JSON.stringify(v14State))
    expect(() => parseAndValidateFlightRouterState(encoded)).toThrow(
      DecodeError
    )
  })
})
