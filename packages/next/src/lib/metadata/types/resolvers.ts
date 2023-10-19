import type { Metadata, ResolvedMetadata } from './metadata-interface'

export type FieldResolver<Key extends keyof Metadata> = (
  T: Metadata[Key]
) => ResolvedMetadata[Key]
export type FieldResolverExtraArgs<
  Key extends keyof Metadata,
  ExtraArgs extends unknown[] = any[]
> = (T: Metadata[Key], ...args: ExtraArgs) => ResolvedMetadata[Key]

export type MetadataContext = {
  pathname: string
}
