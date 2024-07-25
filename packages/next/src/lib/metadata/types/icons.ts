import type { IconDescriptor } from './metadata-types'
import type { TwitterImage } from './twitter-types'
import type { OGImage } from './opengraph-types'

export type StaticMetadata = {
  icon: IconDescriptor[] | undefined
  apple: IconDescriptor[] | undefined
  openGraph: OGImage[] | undefined
  twitter: TwitterImage[] | undefined
  manifest: string | undefined
} | null
