// This utility is based on https://github.com/zertosh/htmlescape
// License: https://github.com/zertosh/htmlescape/blob/0527ca7156a524d256101bb310a9f970f63078ad/LICENSE

const JSON_ESCAPE_FAST_PATH_MAX_LENGTH = 1024 * 1024

export const ESCAPE_REGEX = /[&><\u2028\u2029]/g

function getJsonEscapeReplacement(match: string): string {
  switch (match.charCodeAt(0)) {
    case 38:
      return '\\u0026'
    case 62:
      return '\\u003e'
    case 60:
      return '\\u003c'
    case 0x2028:
      return '\\u2028'
    case 0x2029:
      return '\\u2029'
    default:
      return `\\u${match.charCodeAt(0).toString(16).padStart(4, '0')}`
  }
}

const ATTRIBUTE_ESCAPE_LOOKUP: { [match: string]: string } = {
  '&': '&amp;',
  '"': '&quot;',
  "'": '&#39;',
  '<': '&lt;',
  '>': '&gt;',
}

const ATTRIBUTE_ESCAPE_REGEX = /[&"'<>]/g

export function htmlEscapeJsonString(str: string): string {
  // Native substring search avoids the RegExp replacement setup for the common
  // case where medium-sized serialized data contains no HTML-sensitive bytes.
  // The RegExp path becomes faster again for multi-megabyte one-byte strings.
  if (
    str.length < JSON_ESCAPE_FAST_PATH_MAX_LENGTH &&
    str.indexOf('&') === -1 &&
    str.indexOf('>') === -1 &&
    str.indexOf('<') === -1 &&
    str.indexOf('\u2028') === -1 &&
    str.indexOf('\u2029') === -1
  ) {
    return str
  }
  return str.replace(ESCAPE_REGEX, getJsonEscapeReplacement)
}

export function htmlEscapeAttributeString(str: string): string {
  return str.replace(
    ATTRIBUTE_ESCAPE_REGEX,
    (match) => ATTRIBUTE_ESCAPE_LOOKUP[match]
  )
}
