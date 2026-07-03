// TODO-APP: check if this can be narrowed.
export type ModuleGetter = () => any

export type ModuleTuple = [getModule: ModuleGetter, filePath: string]

// A metadata image entry in the loader tree: either a function that generates
// the image metadata inline, or a loader for an image module whose default
// export generates it. The module is exposed as a loader so that its
// evaluation (which may be async, e.g. due to a top-level await) can be
// tracked separately from calling the generator function, which may
// legitimately block on request data.
export type MetadataImageEntry =
  | ((props: any) => Promise<MetadataImageModule[]>)
  | { loadModule: ModuleGetter }

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
  icon: MetadataImageEntry[]
  apple: MetadataImageEntry[]
  twitter: MetadataImageEntry[] | null
  openGraph: MetadataImageEntry[] | null
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
