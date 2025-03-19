import {
  getExtensionRegexString,
  isMetadataRouteFile,
} from './is-metadata-route'

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

    it('should not handle js extensions with empty dynamic extensions', () => {
      const regex = createExtensionMatchRegex(['png', 'jpg'], [])
      expect(regex.test('.png')).toBe(true)
      expect(regex.test('.jpg')).toBe(true)
      expect(regex.test('.webp')).toBe(false)

      expect(regex.test('.ts')).toBe(false)
      expect(regex.test('.tsx')).toBe(false)
      expect(regex.test('.js')).toBe(false)
    })

    it('should not handle js extensions with passing null for dynamic extensions', () => {
      const regex = createExtensionMatchRegex(['png', 'jpg'], null)
      expect(regex.test('.png')).toBe(true)
      expect(regex.test('.jpg')).toBe(true)
      expect(regex.test('.webp')).toBe(false)

      expect(regex.test('.ts')).toBe(false)
      expect(regex.test('.tsx')).toBe(false)
      expect(regex.test('.js')).toBe(false)
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

describe('isMetadataRouteFile', () => {
  describe('without extension', () => {
    it('should match metadata routes', () => {
      expect(isMetadataRouteFile('/icons/descriptor/page', [], false)).toBe(
        false
      )
    })
  })

  describe('with extension', () => {
    it('should match metadata routes', () => {
      expect(isMetadataRouteFile('/icons/descriptor/page', [], true)).toBe(
        false
      )
    })
  })
})
