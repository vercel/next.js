/* global describe, it, expect */

import getAssetPath from '../../dist/lib/get-asset-path'

describe('getAssetPath', () => {
  it('should work with just hash and asset', () => {
    expect(getAssetPath('abc123', '/my_file')).toBe('/_next/abc123/my_file')
  })

  it('should work with nested asset path', () => {
    expect(getAssetPath('abc123', '/some_dir/for/my_file')).toBe('/_next/abc123/some_dir/for/my_file')
  })

  it('should work with full assetPrefix', () => {
    expect(getAssetPath('abc123', '/page/about', 'http://cdn.example.com')).toBe('http://cdn.example.com/_next/abc123/page/about')
  })

  it('should work with path only assetPrefix', () => {
    expect(getAssetPath('abc123', '/page/about', '/custom/prefix')).toBe('/custom/prefix/_next/abc123/page/about')
  })

  it('should work with assetMap', () => {
    const assetMap = {
      '/page/about': '/app/about/index.js',
      '/page/': '/app/index.js'
    }
    expect(getAssetPath('abc123', '/page/about', 'http://cdn.example.com', assetMap)).toBe('http://cdn.example.com/_next/abc123/app/about/index.js')
    expect(getAssetPath('abc123', '/something/not/in/map', 'http://cdn.example.com', assetMap)).toBe('http://cdn.example.com/_next/abc123/something/not/in/map')
  })
})
