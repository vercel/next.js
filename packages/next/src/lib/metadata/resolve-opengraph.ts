import type { Metadata, ResolvedMetadata } from './types/metadata-interface'

function resolveAsArrayOrUndefined<T = any>(value: T): undefined | any[] {
  if (typeof value === 'undefined' || value === null) {
    return undefined
  }
  if (Array.isArray(value)) {
    return value
  }
  return [value]
}

export function resolveOpenGraph(
  openGraph: Metadata['openGraph']
): ResolvedMetadata['openGraph'] {
  const emails = resolveAsArrayOrUndefined(openGraph?.emails)
  const phoneNumbers = resolveAsArrayOrUndefined(openGraph?.phoneNumbers)
  const faxNumbers = resolveAsArrayOrUndefined(openGraph?.faxNumbers)
  const alternateLocale = resolveAsArrayOrUndefined(openGraph?.alternateLocale)
  const images = resolveAsArrayOrUndefined(openGraph?.images)
  const audio = resolveAsArrayOrUndefined(openGraph?.audio)
  const videos = resolveAsArrayOrUndefined(openGraph?.videos)

  const url = openGraph
    ? typeof openGraph.url === 'string'
      ? new URL(openGraph.url)
      : openGraph.url
    : undefined

  const resolved = {
    ...openGraph,
    ...Object.fromEntries(
      [
        ['emails', emails],
        ['phoneNumbers', phoneNumbers],
        ['faxNumbers', faxNumbers],
        ['alternateLocale', alternateLocale],
        ['images', images],
        ['audio', audio],
        ['videos', videos],
        ['url', url],
      ].filter(([, value]) => typeof value !== 'undefined')
    ),
    title: undefined,
  }

  return resolved
}
