/**
 * Merge multiple args to a single string with spaces. Useful for merging class names.
 * @example
 * cx('foo', 'bar') // 'foo bar'
 * cx('foo', null, 'bar', undefined, 'baz', false) // 'foo bar baz'
 */
export function cx(...args: (string | undefined | null | false)[]): string {
  return args.filter(Boolean).join(' ')
}
