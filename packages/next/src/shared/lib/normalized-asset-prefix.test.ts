import { normalizedAssetPrefix } from './normalized-asset-prefix'

describe('normalizedAssetPrefix', () => {
  it('should return an empty string when assetPrefix is nullish', () => {
    expect(normalizedAssetPrefix(undefined)).toBe('')
  })

  it('should return an empty string when assetPrefix is an empty string', () => {
    expect(normalizedAssetPrefix('')).toBe('')
  })

  it('should remove leading slash(es) when assetPrefix has more than one', () => {
    expect(normalizedAssetPrefix('///path/to/asset')).toBe('/path/to/asset')
  })

  it('should not remove the leading slash when assetPrefix has only one', () => {
    expect(normalizedAssetPrefix('/path/to/asset')).toBe('/path/to/asset')
  })

  it('should add a leading slash when assetPrefix is missing one', () => {
    expect(normalizedAssetPrefix('path/to/asset')).toBe('/path/to/asset')
  })

  it('should return a pathname when assetPrefix is a URL', () => {
    expect(normalizedAssetPrefix('https://example.com/path/to/asset')).toBe(
      '/path/to/asset'
    )
  })
})
