import { clsx } from './clsx'

describe('clsx', () => {
  it('should return an empty string for no arguments', () => {
    expect(clsx()).toBe('')
  })

  it('should join multiple string arguments with spaces', () => {
    expect(clsx('foo', 'bar', 'baz')).toBe('foo bar baz')
  })

  it('should filter out falsy values', () => {
    expect(clsx('foo', null, 'bar', undefined, 'baz', false)).toBe(
      'foo bar baz'
    )
  })

  it('should handle single string argument', () => {
    expect(clsx('foo')).toBe('foo')
  })

  it('should not add extra spaces when falsy values are between strings', () => {
    expect(clsx('foo', null, 'bar')).toBe('foo bar')
  })

  it('should handle all falsy values', () => {
    expect(clsx(null, undefined, false)).toBe('')
  })
})
