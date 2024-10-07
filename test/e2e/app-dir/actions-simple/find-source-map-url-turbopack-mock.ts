export function findSourceMapURL(filename: string): string | null {
  if (filename.startsWith(`${document.location.origin}/_next/static`)) {
    return `${filename}.map`
  }

  const url = new URL('/source-maps-turbopack', document.location.origin)
  url.searchParams.set('filename', filename)

  return url.href
}
