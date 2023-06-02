// TODO-APP: check if this can be narrowed.
export type ComponentModule = () => any
export type ModuleReference = [
  componentModule: ComponentModule,
  filePath: string
]

// Contain the collecting image module paths
export type CollectingMetadata = {
  icon: string[]
  apple: string[]
  twitter: string[]
  openGraph: string[]
  manifest?: string
}

// Contain the collecting evaluated image module
export type CollectedMetadata = {
  icon: ComponentModule[]
  apple: ComponentModule[]
  twitter: ComponentModule[] | null
  openGraph: ComponentModule[] | null
  manifest?: string
}

export type MetadataImageModule = {
  url: string
  type?: string
  alt?: string
} & (
  | { sizes?: string }
  | {
      width?: number
      height?: number
    }
)

export type PossibleImageFileNameConvention =
  | 'icon'
  | 'apple'
  | 'favicon'
  | 'twitter'
  | 'openGraph'

export type PossibleStaticMetadataFileNameConvention =
  | PossibleImageFileNameConvention
  | 'manifest'
