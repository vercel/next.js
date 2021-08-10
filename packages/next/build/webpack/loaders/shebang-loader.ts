/**
 * Matches a string which begins with #!, followed by one or more non-return
 * characters, followed by any number of return characters.
 *
 * This will match a Unix-style shebang and all following newlines.
 */
const shebangPattern = /^#![^\n\r]+[\r\n]*/

/**
 * A Webpack loader which removes the first-line Unix-style shebang if it
 * exists.
 *
 * @param source The source code to load.
 * @returns The replaced source.
 */
function removeShebang(source: string) {
  /** @ts-ignore */
  this?.cacheable && this.cacheable()

  const isString = typeof source === 'string'
  const hasShebang = source.startsWith('#!')
  if (isString && hasShebang) {
    return source.replace(shebangPattern, '')
  }

  return source
}

export default removeShebang
