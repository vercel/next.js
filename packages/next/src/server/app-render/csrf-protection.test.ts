import { isCsrfOriginAllowed } from './csrf-protection'

describe('isCsrfOriginAllowed', () => {
  it('should return true when allowedOrigins contains originDomain', () => {
    expect(isCsrfOriginAllowed('vercel.com', ['vercel.com'])).toBe(true)
    expect(isCsrfOriginAllowed('www.vercel.com', ['www.vercel.com'])).toBe(true)
  })

  it('should return true when allowedOrigins contains originDomain with matching pattern', () => {
    expect(isCsrfOriginAllowed('asdf.vercel.com', ['*.vercel.com'])).toBe(true)
    expect(isCsrfOriginAllowed('asdf.vercel.com', ['**.vercel.com'])).toBe(true)
    expect(isCsrfOriginAllowed('asdf.jkl.vercel.com', ['**.vercel.com'])).toBe(
      true
    )
  })

  it('should return false when allowedOrigins contains originDomain with non-matching pattern', () => {
    expect(isCsrfOriginAllowed('asdf.vercel.com', ['*.vercel.app'])).toBe(false)
    expect(isCsrfOriginAllowed('asdf.jkl.vercel.com', ['*.vercel.com'])).toBe(
      false
    )
    expect(isCsrfOriginAllowed('asdf.jkl.vercel.app', ['**.vercel.com'])).toBe(
      false
    )
  })

  it('should return false when allowedOrigins does not contain originDomain', () => {
    expect(isCsrfOriginAllowed('vercel.com', ['nextjs.org'])).toBe(false)
  })

  it('should return false when allowedOrigins is undefined', () => {
    expect(isCsrfOriginAllowed('vercel.com', undefined)).toBe(false)
  })

  it('should return false when allowedOrigins is empty', () => {
    expect(isCsrfOriginAllowed('vercel.com', [])).toBe(false)
  })

  it('should return false when allowedOrigins is empty string', () => {
    expect(isCsrfOriginAllowed('vercel.com', [''])).toBe(false)
  })
})
