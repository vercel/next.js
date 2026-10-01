import { normalizeResolvedPathname } from 'next/dist/server/route-modules/route-module'

describe('normalizeResolvedPathname (route-module.ts)', () => {
  it('should normalize /index to / for static page', () => {
    expect(normalizeResolvedPathname('/index', '/')).toBe('/')
  })

  it('should NOT normalize /index to / for [slug] route', () => {
    expect(normalizeResolvedPathname('/index', '/[slug]')).toBe('/index')
  })

  it('should NOT normalize /index to / for [...slug] route', () => {
    expect(normalizeResolvedPathname('/index', '/[...slug]')).toBe('/index')
  })

  it('should NOT normalize /index to / for [[...slug]] route', () => {
    expect(normalizeResolvedPathname('/index', '/[[...slug]]')).toBe('/index')
  })
})
