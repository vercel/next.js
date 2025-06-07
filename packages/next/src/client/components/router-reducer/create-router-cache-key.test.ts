import { createRouterCacheKey } from './create-router-cache-key'

describe('createRouterCacheKey', () => {
  it('should support string segment', () => {
    expect(createRouterCacheKey('foo')).toEqual('foo')
  })

  it('should support dynamic segment', () => {
    expect(createRouterCacheKey(['slug', 'hello-world', 'd'])).toEqual(
      'slug|hello-world|d'
    )
  })

  it('should support catch all segment', () => {
    expect(createRouterCacheKey(['slug', 'blog/hello-world', 'c'])).toEqual(
      'slug|blog/hello-world|c'
    )
  })

  it('should include search parameters by default for page segments', () => {
    expect(createRouterCacheKey('__PAGE__?search=term')).toEqual('__PAGE__?search=term')
  })

  it('should exclude search parameters when withoutSearchParameters is true for page segments', () => {
    expect(createRouterCacheKey('__PAGE__?search=term', true)).toEqual('__PAGE__')
  })

  it('should not affect non-page segments when withoutSearchParameters is true', () => {
    expect(createRouterCacheKey('layout?foo=bar', true)).toEqual('layout?foo=bar')
  })

  it('should handle page segments without search parameters', () => {
    expect(createRouterCacheKey('__PAGE__', true)).toEqual('__PAGE__')
    expect(createRouterCacheKey('__PAGE__', false)).toEqual('__PAGE__')
  })
})
