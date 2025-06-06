import type { Metadata, ResolvedMetadata } from './metadata-interface'

export type FieldResolver<
  Key extends keyof Data & keyof ResolvedData,
  Data = Metadata,
  ResolvedData = ResolvedMetadata,
> = (T: Data[Key]) => ResolvedData[Key]

export type FieldResolverExtraArgs<
  Key extends keyof Data & keyof ResolvedData,
  ExtraArgs extends unknown[] = any[],
  Data = Metadata,
  ResolvedData = ResolvedMetadata,
> = (T: Data[Key], ...args: ExtraArgs) => ResolvedData[Key]

export type AsyncFieldResolverExtraArgs<
  Key extends keyof Data & keyof ResolvedData,
  ExtraArgs extends unknown[] = any[],
  Data = Metadata,
  ResolvedData = ResolvedMetadata,
> = (T: Data[Key], ...args: ExtraArgs) => Promise<ResolvedData[Key]>

export type MetadataContext = {
  trailingSlash: boolean
  isStaticMetadataRouteFile: boolean
}
