export function escapeStringRegexp(str: string) {
  return str.replace(/[|\\{}()[\]^$+*?.-]/g, '\\$&')
}
