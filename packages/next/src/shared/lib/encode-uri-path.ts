function isEncodeURIPathSafeCode(code: number) {
  return (
    (code >= 48 && code <= 57) || // 0-9
    (code >= 65 && code <= 90) || // A-Z
    (code >= 97 && code <= 122) || // a-z
    code === 33 || // !
    code === 39 || // '
    code === 40 || // (
    code === 41 || // )
    code === 42 || // *
    code === 45 || // -
    code === 46 || // .
    code === 47 || // /
    code === 95 || // _
    code === 126 // ~
  )
}

export function encodeURIPath(file: string) {
  for (let i = 0; i < file.length; i++) {
    if (!isEncodeURIPathSafeCode(file.charCodeAt(i))) {
      return encodeURIComponent(file).replaceAll('%2F', '/')
    }
  }

  return file
}
