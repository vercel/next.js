export function encodeURIPath(file: string) {
  return (
    file
      .split('/')
      // encodeURIComponent does not encode parenthesis, used by route groups, while they do need to be encoded to comply with RFC 3986
      .map((p) =>
        encodeURIComponent(p).replace(
          /[()]/g,
          (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
        )
      )
      .join('/')
  )
}
