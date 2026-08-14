import { createMetadataComponents as createLegacyMetadataComponents } from './metadata'
import { createMetadataComponents as createParallelMetadataComponents } from './metadata-parallel'

export function createMetadataComponents({
  parallelRouteMetadata,
  ...props
}: Parameters<typeof createLegacyMetadataComponents>[0] & {
  parallelRouteMetadata: boolean
}) {
  return parallelRouteMetadata
    ? createParallelMetadataComponents(props)
    : createLegacyMetadataComponents(props)
}
