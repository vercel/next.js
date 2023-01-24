import type { Metadata } from './types/metadata-interface'
import type {
  OpenGraphType,
  OpenGraph,
  ResolvedOpenGraph,
} from './types/opengraph-types'
import { resolveAsArrayOrUndefined } from './generate/utils'

const OgTypFields = {
  article: ['authors', 'tags'],
  song: ['albums', 'musicians'],
  playlist: ['albums', 'musicians'],
  radio: ['creators'],
  video: ['actors', 'directors', 'writers', 'tags'],
  basic: [
    'emails',
    'phoneNumbers',
    'faxNumbers',
    'alternateLocale',
    'images',
    'audio',
    'videos',
  ],
} as const

function getFieldsByOgType(ogType: OpenGraphType | undefined) {
  switch (ogType) {
    case 'article':
    case 'book':
      return OgTypFields.article
    case 'music.song':
    case 'music.album':
      return OgTypFields.song
    case 'music.playlist':
      return OgTypFields.playlist
    case 'music.radio_station':
      return OgTypFields.radio
    case 'video.movie':
    case 'video.episode':
      return OgTypFields.video
    default:
      return OgTypFields.basic
  }
}

export function resolveOpenGraph(
  openGraph: Metadata['openGraph']
): ResolvedOpenGraph {
  const url = openGraph
    ? typeof openGraph.url === 'string'
      ? new URL(openGraph.url)
      : openGraph.url
    : undefined

  // TODO: improve typing
  const resolved: { [x: string]: any } = openGraph || {}

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

  return resolved as ResolvedOpenGraph
}
