/**
 * Merge multiple args to a single string with spaces. Useful for merging class names.
 *
 * @example
 * mergeClassNames('foo', 'bar') // 'foo bar'
 * mergeClassNames('foo', null, 'bar', undefined, 'baz', false) // 'foo bar baz'
 *
 * @alias `cn()`
 */
export function mergeClassNames(
  ...args: (string | undefined | null | false)[]
): string {
  return args.filter(Boolean).join(' ')
}

export { mergeClassNames as cn }
