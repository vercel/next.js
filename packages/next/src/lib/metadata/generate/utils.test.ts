import { normalizeMetadataString } from './utils'

describe('normalizeMetadataString', () => {
  it('should strip carriage returns from string', () => {
    expect(normalizeMetadataString('line1\r\nline2\r\nline3')).toBe(
      'line1\nline2\nline3'
    )
  })

  it('should handle string with only carriage returns', () => {
    expect(normalizeMetadataString('a\rb\rc')).toBe('abc')
  })

  it('should return string unchanged if no carriage returns', () => {
    expect(normalizeMetadataString('line1\nline2')).toBe('line1\nline2')
  })

  it('should return null as-is', () => {
    expect(normalizeMetadataString(null)).toBeNull()
  })

  it('should return undefined as-is', () => {
    expect(normalizeMetadataString(undefined)).toBeUndefined()
  })

  it('should handle empty string', () => {
    expect(normalizeMetadataString('')).toBe('')
  })
})
