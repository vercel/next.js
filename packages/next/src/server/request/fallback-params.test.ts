import { createOpaqueFallbackRouteParams } from './fallback-params'
import type { FallbackRouteParam } from '../../build/static-paths/types'

describe('createOpaqueFallbackRouteParams', () => {
  describe('multiple mixed parameters', () => {
    it('iterator only yields non-parallel route parameters', () => {
      const fallbackParams: readonly FallbackRouteParam[] = [
        { paramName: 'slug', isParallelRouteParam: false },
        { paramName: 'modal', isParallelRouteParam: true },
        { paramName: 'category', isParallelRouteParam: false },
        { paramName: 'sidebar', isParallelRouteParam: true },
      ]

      const result = createOpaqueFallbackRouteParams(fallbackParams)!
      const entries = Array.from(result)

      expect(entries).toHaveLength(2)

      const paramNames = entries.map(([name]) => name)
      expect(paramNames).toContain('slug')
      expect(paramNames).toContain('category')
      expect(paramNames).not.toContain('modal')
      expect(paramNames).not.toContain('sidebar')
    })
  })

  describe('opaque object interface', () => {
    const fallbackParams: readonly FallbackRouteParam[] = [
      { paramName: 'slug', isParallelRouteParam: false },
      { paramName: 'modal', isParallelRouteParam: true },
    ]

    it('has method works correctly', () => {
      const result = createOpaqueFallbackRouteParams(fallbackParams)!

      expect(result.has('slug')).toBe(true)
      expect(result.has('modal')).toBe(true)
      expect(result.has('nonexistent')).toBe(false)
      expect(result.has('')).toBe(false)
    })

    it('get method works correctly', () => {
      const result = createOpaqueFallbackRouteParams(fallbackParams)!

      expect(result.get('slug')).toMatch(/^%%drp:slug:[a-f0-9]+%%$/)
      expect(result.get('modal')).toMatch(/^%%drp:modal:[a-f0-9]+%%$/)
      expect(result.get('nonexistent')).toBeUndefined()
      expect(result.get('')).toBeUndefined()
    })

    it('iterator yields correct entries', () => {
      const result = createOpaqueFallbackRouteParams(fallbackParams)!

      const entries = Array.from(result)
      expect(entries).toHaveLength(1)

      const [name, value] = entries[0]
      expect(name).toBe('slug')
      expect(value).toMatch(/^%%drp:slug:[a-f0-9]+%%$/)
    })
  })
})
