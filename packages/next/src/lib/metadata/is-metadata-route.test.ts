import {
  getExtensionRegexString,
  isMetadataRouteFile,
  isMetadataRoute,
  isMetadataPage,
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
  describe('match route - without extension', () => {
    it('should match metadata route page paths', () => {
      expect(isMetadataRouteFile('/icons/descriptor/page', [], false)).toBe(
        false
      )
      expect(isMetadataRouteFile('/foo/icon', [], false)).toBe(true)
      expect(isMetadataRouteFile('/foo/opengraph-image', [], false)).toBe(true)
      expect(isMetadataRouteFile('/foo/sitemap.xml', [], false)).toBe(true)
      // group routes
      expect(
        isMetadataRouteFile('/foo/opengraph-image-abc123', [], false)
      ).toBe(true)
      // These pages are not normalized from actual entry files
      expect(isMetadataRouteFile('/foo/sitemap/0.xml', [], false)).toBe(false)
      expect(
        isMetadataRouteFile('/foo/opengraph-image-abc12313333', [], false)
      ).toBe(false)
    })
  })

  describe('match file - with extension', () => {
    it('should match static metadata route files', () => {
      expect(isMetadataRouteFile('/icons/descriptor/page', [], true)).toBe(
        false
      )
      expect(isMetadataRouteFile('/foo/icon.png', [], true)).toBe(true)
      expect(isMetadataRouteFile('/bar/opengraph-image.jpg', [], true)).toBe(
        true
      )
      expect(isMetadataRouteFile('/favicon.ico', [], true)).toBe(true)
      expect(isMetadataRouteFile('/robots.txt', [], true)).toBe(true)
      expect(isMetadataRouteFile('/manifest.json', [], true)).toBe(true)
      expect(isMetadataRouteFile('/sitemap.xml', [], true)).toBe(true)
    })

    it('should match dynamic metadata routes', () => {
      // with dynamic extensions, passing the 2nd arg: such as ['tsx', 'ts']
      expect(isMetadataRouteFile('/foo/icon.js', ['tsx', 'ts'], true)).toBe(
        false
      )
      expect(isMetadataRouteFile('/foo/icon.ts', ['tsx', 'ts'], true)).toBe(
        true
      )
      expect(
        isMetadataRouteFile('/foo/icon.tsx', ['js', 'jsx', 'tsx', 'ts'], true)
      ).toBe(true)
    })
  })
})

describe('isMetadataRoute', () => {
  it('should require suffix for metadata routes', () => {
    expect(isMetadataRoute('/icon')).toBe(false)
    expect(isMetadataRoute('/icon/route')).toBe(true)
    expect(isMetadataRoute('/opengraph-image')).toBe(false)
    expect(isMetadataRoute('/opengraph-image/route')).toBe(true)
  })

  it('should match metadata routes', () => {
    expect(isMetadataRoute('/app/robots/route')).toBe(true)
    expect(isMetadataRoute('/robots/route')).toBe(true)
    expect(isMetadataRoute('/sitemap/[__metadata_id__]/route')).toBe(true)
    expect(isMetadataRoute('/app/sitemap/page')).toBe(false)
    expect(isMetadataRoute('/icon-a102f4/route')).toBe(true)
  })

  it('should match grouped metadata routes', () => {
    expect(isMetadataRoute('/opengraph-image-1ow20b/route')).toBe(true)
    expect(isMetadataRoute('/foo/icon2-1ow20b/route')).toBe(true)
  })

  it('should support metadata variant numeric suffix', () => {
    expect(isMetadataRoute('/icon0/route')).toBe(true)
    expect(isMetadataRoute('/opengraph-image1/route')).toBe(true)
    expect(isMetadataRoute('/foo/icon0-a120ff/route')).toBe(true)
    expect(isMetadataRoute('/foo/icon0-a120ff3/route')).toBe(false)
  })
})

describe('isMetadataPage', () => {
  it('should match metadata page path', () => {
    expect(isMetadataPage('/sitemap.xml')).toBe(true)
    expect(isMetadataPage('/favicon.ico')).toBe(true)
    expect(isMetadataPage('/manifest.json')).toBe(true)
    expect(isMetadataPage('/robots.txt')).toBe(true)
  })

  it('should not match app router page path or error boundary path', () => {
    expect(isMetadataPage('/icon/page')).toBe(false)
    expect(isMetadataPage('/icon/route')).toBe(false)
    expect(isMetadataPage('/icon/error')).toBe(false)
    expect(isMetadataPage('/icon/not-found')).toBe(false)
  })
})
