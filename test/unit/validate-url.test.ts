import { validateURL } from 'next/dist/server/app-render/validate-url'

describe('validateUrl', () => {
  it('should return valid pathname', () => {
    expect(validateURL('/')).toBe('/')
    expect(validateURL('/abc')).toBe('/abc')
  })

  it('should throw for invalid pathname', () => {
    expect(() => validateURL('//**y/\\')).toThrow()
    expect(() => validateURL('//google.com')).toThrow()
  })
})
