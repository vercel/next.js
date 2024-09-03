import { normalizeCodeLocInfo } from './next-test-utils'

describe('normalizeCodeLocInfo', () => {
  it('should normalize code location information', () => {
    const input = `
Error: Test error
    at FunctionName (/path/to/file.js:123:45)
    in ComponentName (at /path/to/component.js:67:89)
    at AnotherFunction (/different/path/file.js:10:20)`

    const expected = `
Error: Test error
    at FunctionName (**)
    at ComponentName (**)
    at AnotherFunction (**)`

    expect(normalizeCodeLocInfo(input)).toBe(expected)
  })

  it('should return undefined for falsy input', () => {
    expect(normalizeCodeLocInfo('')).toBeUndefined()
    expect(normalizeCodeLocInfo(null)).toBeUndefined()
    expect(normalizeCodeLocInfo(undefined)).toBeUndefined()
  })

  it('should not modify strings without code location info', () => {
    const input = 'This is a normal string without code location info'
    expect(normalizeCodeLocInfo(input)).toBe(input)
  })

  it('should handle multiple code locations', () => {
    const input = `../../../packages/next/dist/compiled/react-dom/cjs/react-dom-client.development.js (22126:1)`

    const expected = `at ** (**)`

    expect(normalizeCodeLocInfo(input)).toBe(expected)
  })
})
