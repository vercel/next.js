import type { DynamicParamTypesShort } from './app-router-types'
import { convertDynamicParamType } from './convert-dynamic-param-type'

describe('convertDynamicParamType', () => {
  describe('basic dynamic parameters', () => {
    it('should convert dynamic param type "d" to [param]', () => {
      expect(convertDynamicParamType('d', 'slug')).toBe('[slug]')
      expect(convertDynamicParamType('d', 'id')).toBe('[id]')
    })

    it('should convert catch-all param type "c" to [...param]', () => {
      expect(convertDynamicParamType('c', 'slug')).toBe('[...slug]')
      expect(convertDynamicParamType('c', 'path')).toBe('[...path]')
    })

    it('should convert optional catch-all param type "oc" to [[...param]]', () => {
      expect(convertDynamicParamType('oc', 'slug')).toBe('[[...slug]]')
      expect(convertDynamicParamType('oc', 'segments')).toBe('[[...segments]]')
    })
  })

  describe('intercepted dynamic parameters (di)', () => {
    it('should preserve same-level interception marker for di(.)', () => {
      expect(convertDynamicParamType('di(.)', 'id')).toBe('(.)[id]')
      expect(convertDynamicParamType('di(.)', 'photoId')).toBe('(.)[photoId]')
    })

    it('should preserve parent-level interception marker for di(..)', () => {
      expect(convertDynamicParamType('di(..)', 'id')).toBe('(..)[id]')
      expect(convertDynamicParamType('di(..)', 'productId')).toBe(
        '(..)[productId]'
      )
    })

    it('should preserve root-level interception marker for di(...)', () => {
      expect(convertDynamicParamType('di(...)', 'id')).toBe('(...)[id]')
      expect(convertDynamicParamType('di(...)', 'userId')).toBe('(...)[userId]')
    })

    it('should preserve two-level interception marker for di(..)(..)', () => {
      expect(convertDynamicParamType('di(..)(..)', 'id')).toBe('(..)(..)[id]')
    })
  })

  describe('intercepted catch-all parameters (ci)', () => {
    it('should preserve same-level interception marker for ci(.)', () => {
      expect(convertDynamicParamType('ci(.)', 'path')).toBe('(.)[...path]')
      expect(convertDynamicParamType('ci(.)', 'slug')).toBe('(.)[...slug]')
    })

    it('should preserve parent-level interception marker for ci(..)', () => {
      expect(convertDynamicParamType('ci(..)', 'path')).toBe('(..)[...path]')
    })

    it('should preserve root-level interception marker for ci(...)', () => {
      expect(convertDynamicParamType('ci(...)', 'segments')).toBe(
        '(...)[...segments]'
      )
    })

    it('should preserve two-level interception marker for ci(..)(..)', () => {
      expect(convertDynamicParamType('ci(..)(..)', 'path')).toBe(
        '(..)(..)[...path]'
      )
    })
  })

  describe('entrypoint resolution compatibility', () => {
    // These tests verify that the output matches actual folder names in the app directory.
    // This is critical for on-demand-entry-handler to correctly resolve entrypoints.

    it('should produce folder-matching names for intercepted dynamic routes', () => {
      // Folder: app/gallery/@modal/(group)/(.)[id]/page.tsx
      // The segment type would be 'di(.)' and param 'id'
      const result = convertDynamicParamType('di(.)', 'id')
      expect(result).toBe('(.)[id]')
      // This should match the actual folder name "(.)[id]"
    })

    it('should produce folder-matching names for intercepted catch-all routes', () => {
      // Folder: app/docs/@preview/(.)[...path]/page.tsx
      // The segment type would be 'ci(.)' and param 'path'
      const result = convertDynamicParamType('ci(.)', 'path')
      expect(result).toBe('(.)[...path]')
      // This should match the actual folder name "(.)[...path]"
    })

    it('should handle all DynamicParamTypesShort values', () => {
      const types: DynamicParamTypesShort[] = [
        'd',
        'c',
        'oc',
        'di(.)',
        'di(..)',
        'di(...)',
        'di(..)(..)',
        'ci(.)',
        'ci(..)',
        'ci(...)',
        'ci(..)(..)',
      ]

      for (const type of types) {
        const result = convertDynamicParamType(type, 'param')
        expect(typeof result).toBe('string')
        expect(result.length).toBeGreaterThan(0)
      }
    })
  })
})
