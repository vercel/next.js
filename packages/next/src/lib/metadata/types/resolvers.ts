import { Metadata, ResolvedMetadata } from './metadata-interface'

export type FieldResolver<Key extends keyof Metadata> = (
  T: Metadata[Key]
) => ResolvedMetadata[Key]
export type FieldResolverWithMetadataBase<
  Key extends keyof Metadata,
  Options = undefined
> = Options extends undefined
  ? (
      T: Metadata[Key],
      metadataBase: ResolvedMetadata['metadataBase']
    ) => ResolvedMetadata[Key]
  : (
      T: Metadata[Key],
      metadataBase: ResolvedMetadata['metadataBase'],
      options: Options
    ) => ResolvedMetadata[Key]
