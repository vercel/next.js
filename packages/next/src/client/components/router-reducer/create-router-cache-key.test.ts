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
})
