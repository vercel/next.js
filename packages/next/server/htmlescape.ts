// This utility is based on https://github.com/zertosh/htmlescape
// License: https://github.com/zertosh/htmlescape/blob/0527ca7156a524d256101bb310a9f970f63078ad/LICENSE

const ESCAPE_LOOKUP: { [match: string]: string } = {
  '&': '\\u0026',
  '>': '\\u003e',
  '<': '\\u003c',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
}

const ESCAPE_REGEX = /(\\u0026|\\u003e|\\u003c|\\u2028|\\u2029)/g
const DEESCAPE_REGEX = /[&><\u2028\u2029]/g
const DEESCAPE_LOOKUP: typeof ESCAPE_LOOKUP = Object.keys(ESCAPE_LOOKUP).reduce(
  (prev, key) => ({ ...prev, [ESCAPE_LOOKUP[key]]: key }),
  {} as typeof ESCAPE_LOOKUP
)

export function htmlEscapeJsonString(str: string): string {
  return str.replace(ESCAPE_REGEX, (match) => ESCAPE_LOOKUP[match])
}

export function htmlDeEscapeJsonString(str: string): string {
  return str.replace(DEESCAPE_REGEX, (match) => DEESCAPE_LOOKUP[match])
}
