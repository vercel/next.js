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

  const typedEntries = []
  if (openGraph && 'type' in openGraph && openGraph.type) {
    switch (openGraph.type) {
      case 'article':
        typedEntries.push(
          ['authors', resolveAsArrayOrUndefined(openGraph.authors)],
          ['tags', resolveAsArrayOrUndefined(openGraph.tags)]
        )
        break
      case 'book':
        typedEntries.push(
          ['authors', resolveAsArrayOrUndefined(openGraph.authors)],
          ['tags', resolveAsArrayOrUndefined(openGraph.tags)]
        )
        break
      case 'music.song':
        typedEntries.push(
          ['albums', resolveAsArrayOrUndefined(openGraph.albums)],
          ['musicians', resolveAsArrayOrUndefined(openGraph.musicians)]
        )
        break
      case 'music.album':
        typedEntries.push(
          ['songs', resolveAsArrayOrUndefined(openGraph.songs)],
          ['musicians', resolveAsArrayOrUndefined(openGraph.musicians)]
        )
        break
      case 'music.playlist':
        typedEntries.push(
          ['songs', resolveAsArrayOrUndefined(openGraph.songs)],
          ['creators', resolveAsArrayOrUndefined(openGraph.creators)]
        )
        break
      case 'music.radio_station':
        typedEntries.push([
          'creators',
          resolveAsArrayOrUndefined(openGraph.creators),
        ])
        break
      case 'video.movie':
        typedEntries.push(
          ['actors', resolveAsArrayOrUndefined(openGraph.actors)],
          ['directors', resolveAsArrayOrUndefined(openGraph.directors)],
          ['writers', resolveAsArrayOrUndefined(openGraph.writers)],
          ['tags', resolveAsArrayOrUndefined(openGraph.tags)]
        )
        break
      case 'video.episode':
        typedEntries.push(
          ['actors', resolveAsArrayOrUndefined(openGraph.actors)],
          ['directors', resolveAsArrayOrUndefined(openGraph.directors)],
          ['writers', resolveAsArrayOrUndefined(openGraph.writers)],
          ['tags', resolveAsArrayOrUndefined(openGraph.tags)]
        )
        break
    }
  }

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
        ...typedEntries,
      ].filter(([, value]) => typeof value !== 'undefined')
    ),
    title: undefined,
  }

  return resolved
}
