/* eslint-env jest */
import { normalizeResolvedPathname } from 'next/dist/server/route-modules/route-module'

describe('normalizeResolvedPathname', () => {
  it('should normalize /index to / for static root page', () => {
    expect(normalizeResolvedPathname('/index', '/')).toBe('/')
  })

  it('should NOT normalize /index to / for [slug] dynamic route', () => {
    expect(normalizeResolvedPathname('/index', '/[slug]')).toBe('/index')
  })

  it('should NOT normalize /index to / for catch-all [...slug] route', () => {
    expect(normalizeResolvedPathname('/index', '/[...slug]')).toBe('/index')
  })

  it('should NOT normalize /index to / for optional catch-all [[...slug]] route', () => {
    expect(normalizeResolvedPathname('/index', '/[[...slug]]')).toBe('/index')
  })

  it('should pass through other pathnames unchanged', () => {
    expect(normalizeResolvedPathname('/about', '/about')).toBe('/about')
    expect(normalizeResolvedPathname('/posts/123', '/posts/[id]')).toBe(
      '/posts/123'
    )
    expect(normalizeResolvedPathname('/', '/')).toBe('/')
  })
})
