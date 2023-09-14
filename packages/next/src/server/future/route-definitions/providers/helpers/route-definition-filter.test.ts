import { createMatcher } from './route-definition-filter'

describe('createRouteDefinitionFilter', () => {
  it('should filter object with a single key', () => {
    const filter = createMatcher({ page: '/foo' })

    expect(filter({ page: '/foo' })).toBe(true)
    expect(filter({ page: '/bar' })).toBe(false)
  })

  it('should filter object with multiple keys', () => {
    const filter = createMatcher({ page: '/foo', foo: 'bar' })

    expect(filter({ page: '/foo', foo: 'bar' })).toBe(true)
    expect(filter({ page: '/foo', foo: 'baz' })).toBe(false)
    expect(filter({ page: '/bar', foo: 'bar' })).toBe(false)
  })

  it('should error when the spec includes an array', () => {
    expect(() => createMatcher({ page: ['/foo'] })).toThrowError()
  })

  it('should filter nested objects', () => {
    const filter = createMatcher({ page: '/foo', foo: { bar: 'baz' } })

    expect(filter({ page: '/foo', foo: { bar: 'baz' } })).toBe(true)
    expect(filter({ page: '/foo', foo: { bar: 'qux' } })).toBe(false)
    expect(filter({ page: '/bar', foo: { bar: 'baz' } })).toBe(false)
  })
})
