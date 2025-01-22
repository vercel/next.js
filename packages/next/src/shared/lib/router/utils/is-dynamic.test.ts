import { isDynamicRoute } from './is-dynamic'

describe('isDynamicRoute', () => {
  describe('strict', () => {
    it('should return true for dynamic routes', () => {
      expect(isDynamicRoute('/blog/[...slug]')).toBe(true)
    })

    it('should return false for static routes', () => {
      expect(isDynamicRoute('/blog/123')).toBe(false)
    })

    it('should return true for dynamic routes with a suffix', () => {
      expect(isDynamicRoute('/blog/[slug].json')).toBe(false)
    })

    it('should return false for dynamic routes with a prefix', () => {
      expect(isDynamicRoute('/blog/$d$slug$[...slug]/')).toBe(false)
    })

    it('should return false for dynamic routes with a suffix and prefix', () => {
      expect(isDynamicRoute('/blog/$d$slug$[...slug].json')).toBe(false)
    })
  })

  describe('non-strict', () => {
    it('should return true for dynamic routes', () => {
      expect(isDynamicRoute('/blog/[...slug]', false)).toBe(true)
    })

    it('should return false for static routes', () => {
      expect(isDynamicRoute('/blog/123', false)).toBe(false)
    })

    it('should return true for dynamic routes with a suffix', () => {
      expect(isDynamicRoute('/blog/[slug].json', false)).toBe(true)
    })

    it('should return true for dynamic routes with a prefix', () => {
      expect(isDynamicRoute('/blog/$d$slug$[...slug]/', false)).toBe(true)
    })

    it('should return true for dynamic routes with a suffix and prefix', () => {
      expect(isDynamicRoute('/blog/$d$slug$[...slug].json', false)).toBe(true)
    })
  })
})
