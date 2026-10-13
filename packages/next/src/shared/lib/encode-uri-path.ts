const unsafeURIPathCharacter = /[^A-Za-z0-9_.!~*'()\u002f-]/
const nonAsciiCharacter = /[\x80-\uFFFF]/

function encodeURIPathBySegment(file: string) {
  let slash = file.indexOf('/')
  if (slash === -1) {
    return encodeURIComponent(file)
  }

  let encoded = ''
  let start = 0
  do {
    encoded += encodeURIComponent(file.slice(start, slash)) + '/'
    start = slash + 1
    slash = file.indexOf('/', start)
  } while (slash !== -1)

  return encoded + encodeURIComponent(file.slice(start))
}

export function encodeURIPath(file: string) {
  if (!unsafeURIPathCharacter.test(file)) {
    return file
  }

  if (file.length >= 128 && !nonAsciiCharacter.test(file)) {
    return encodeURIComponent(file).replaceAll('%2F', '/')
  }

  return encodeURIPathBySegment(file)
}
