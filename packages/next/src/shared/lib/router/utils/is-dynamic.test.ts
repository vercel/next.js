import { isDynamicRoute } from './is-dynamic'

describe('isDynamicRoute', () => {
  it('should return true for dynamic routes', () => {
    expect(isDynamicRoute('/blog/[...slug]')).toBe(true)
  })

  it('should return false for static routes', () => {
    expect(isDynamicRoute('/blog/123')).toBe(false)
  })

  it('should return true for dynamic routes with a suffix', () => {
    expect(isDynamicRoute('/blog/[slug].json')).toBe(true)
  })

  it('should return true for dynamic routes with a prefix', () => {
    expect(isDynamicRoute('/blog/$d$slug$[...slug]/')).toBe(true)
  })

  it('should return true for dynamic routes with a suffix and prefix', () => {
    expect(isDynamicRoute('/blog/$d$slug$[...slug].json')).toBe(true)
  })
})
