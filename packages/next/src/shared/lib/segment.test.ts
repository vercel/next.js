import { getSegmentValue } from './segment'

describe('getSegmentValue', () => {
  it('should support string segment', () => {
    expect(getSegmentValue('foo')).toEqual('foo')
  })

  it('should support dynamic segment', () => {
    expect(getSegmentValue(['slug', 'hello-world', 'd'])).toEqual('hello-world')
  })

  it('should support catch all segment', () => {
    expect(getSegmentValue(['slug', 'blog/hello-world', 'c'])).toEqual(
      'blog/hello-world'
    )
  })
})
