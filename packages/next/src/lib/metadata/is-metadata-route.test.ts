import { getExtensionRegexString } from './is-metadata-route'

describe('getExtensionRegexString', () => {
  function createExtensionMatchRegex(
    ...args: Parameters<typeof getExtensionRegexString>
  ) {
    return new RegExp(`^${getExtensionRegexString(...args)}$`)
  }

  describe('with dynamic extensions', () => {
    it('should return the correct regex', () => {
      const regex = createExtensionMatchRegex(['png', 'jpg'], ['tsx', 'ts'])
      expect(regex.test('.png')).toBe(true)
      expect(regex.test('.jpg')).toBe(true)
      expect(regex.test('.webp')).toBe(false)

      expect(regex.test('.tsx')).toBe(true)
      expect(regex.test('.ts')).toBe(true)
      expect(regex.test('.js')).toBe(false)
    })

    it('should match dynamic multi-routes with dynamic extensions', () => {
      const regex = createExtensionMatchRegex(['png'], ['ts'])
      expect(regex.test('.png')).toBe(true)
      expect(regex.test('[].png')).toBe(false)

      expect(regex.test('.ts')).toBe(true)
      expect(regex.test('[].ts')).toBe(true)
      expect(regex.test('.tsx')).toBe(false)
      expect(regex.test('[].tsx')).toBe(false)
    })
  })

  describe('without dynamic extensions', () => {
    it('should return the correct regex', () => {
      const regex = createExtensionMatchRegex(['png', 'jpg'], null)
      expect(regex.test('.png')).toBe(true)
      expect(regex.test('.jpg')).toBe(true)
      expect(regex.test('.webp')).toBe(false)

      expect(regex.test('.tsx')).toBe(false)
      expect(regex.test('.js')).toBe(false)
    })
  })
})
