import type { Metadata, ResolvedMetadata } from './types/metadata-interface'
import type { OpenGraphType, OpenGraph } from './types/opengraph-types'

function resolveAsArrayOrUndefined<T = any>(value: T): undefined | any[] {
  if (typeof value === 'undefined' || value === null) {
    return undefined
  }
  if (Array.isArray(value)) {
    return value
  }
  return [value]
}

function getFieldsByOgType(ogType: OpenGraphType | undefined) {
  const articleKeys = ['authors', 'tags'] // article, book
  const songKeys = ['albums', 'musicians'] // music.song, music.album
  const playlistKeys = ['albums', 'musicians'] // music.playlist
  const radioStationsKeys = ['creators']
  const videoKeys = ['actors', 'directors', 'writers', 'tags']

  switch (ogType) {
    case 'article':
    case 'book':
      return articleKeys
    case 'music.song':
    case 'music.album':
      return songKeys
    case 'music.playlist':
      return playlistKeys
    case 'music.radio_station':
      return radioStationsKeys
    case 'video.movie':
    case 'video.episode':
      return videoKeys
    default:
      return [
        'emails',
        'phoneNumbers',
        'faxNumbers',
        'alternateLocale',
        'images',
        'audio',
        'videos',
      ]
  }
}

export function resolveOpenGraph(
  openGraph: Metadata['openGraph']
): ResolvedMetadata['openGraph'] {
  const url = openGraph
    ? typeof openGraph.url === 'string'
      ? new URL(openGraph.url)
      : openGraph.url
    : undefined

  // TODO: improve typing
  const resolved: { [x: string]: any } = {
    ...openGraph,
    title: undefined,
  }

  function assignProps(og: OpenGraph) {
    const ogType = og && 'type' in og ? og.type : undefined
    const keys = getFieldsByOgType(ogType)
    for (const k of keys) {
      const key = k as keyof OpenGraph
      if (key in og) {
        // TODO: fix typing inferring
        // @ts-ignore
        const value = resolveAsArrayOrUndefined(og[key])
        if (value != null) {
          ;(resolved as any)[key] = value
        }
      }
    }
  }

  if (openGraph) {
    assignProps(openGraph)
  }

  if (url) {
    resolved.url = url
  }

  return resolved as ResolvedMetadata['openGraph']
}
