import { createOpaqueFallbackRouteParams } from './fallback-params'
import type { FallbackRouteParam } from '../../build/static-paths/types'

describe('createOpaqueFallbackRouteParams', () => {
  describe('opaque object interface', () => {
    const fallbackParams: readonly FallbackRouteParam[] = [
      { paramName: 'slug', paramType: 'dynamic', isParallelRouteParam: false },
      { paramName: 'modal', paramType: 'dynamic', isParallelRouteParam: true },
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

      expect(result.get('slug')?.[0]).toMatch(/^%%drp:slug:[a-f0-9]+%%$/)
      expect(result.get('modal')?.[0]).toMatch(/^%%drp:modal:[a-f0-9]+%%$/)
      expect(result.get('nonexistent')).toBeUndefined()
      expect(result.get('')).toBeUndefined()
    })

    it('iterator yields correct entries', () => {
      const result = createOpaqueFallbackRouteParams(fallbackParams)!

      const entries = Array.from(result.entries())
      expect(entries).toHaveLength(2)

      const [name, [value]] = entries[0]
      expect(name).toBe('slug')
      expect(value).toMatch(/^%%drp:slug:[a-f0-9]+%%$/)
    })
  })
})
