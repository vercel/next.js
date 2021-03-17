export function getSourceMapUrl(fileContents: string): string | null {
  const regex = /\/\/[#@] ?sourceMappingURL=([^\s'"]+)\s*$/gm
  let match = null
  for (;;) {
    let next = regex.exec(fileContents)
    if (next == null) {
      break
    }
    match = next
  }
  if (!(match && match[1])) {
    return null
  }
  return match[1].toString()
}
