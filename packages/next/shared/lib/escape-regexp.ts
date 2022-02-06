// regexp from https://github.com/sindresorhus/escape-string-regexp
export function escapeStringRegexp(str: string) {
  return str.replace(/[|\\{}()[\]^$+*?.-]/g, '\\$&')
}
