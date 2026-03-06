import { mediaType } from 'next/dist/compiled/@hapi/accept'

export function acceptsMarkdown(
  accept: string | string[] | undefined
): boolean {
  if (!accept) {
    return false
  }

  const value = Array.isArray(accept) ? accept.join(', ') : accept
  return mediaType(value, ['text/html', 'text/markdown']) === 'text/markdown'
}

export function appendAcceptVaryHeader(
  vary: string | string[] | number | undefined
): string {
  const values = (
    Array.isArray(vary)
      ? vary.flatMap((entry) => String(entry).split(','))
      : typeof vary === 'string'
        ? vary.split(',')
        : []
  )
    .map((value) => value.trim())
    .filter(Boolean)

  if (values.some((value) => value.toLowerCase() === 'accept')) {
    return values.join(', ')
  }

  values.push('Accept')
  return values.join(', ')
}
