import type { ResolvedMetadata } from './types/metadata-interface'

import React from 'react'
import { ResolvedBasicMetadata } from './generate/basic'
import { ResolvedAlternatesMetadata } from './generate/alternate'
import { ResolvedOpenGraphMetadata } from './generate/opengraph'
import { resolveMetadata } from './resolve-metadata'
import { ResolvedIconsMetadata } from './generate/icons'

// Generate the actual React elements from the resolved metadata.
export async function Metadata({ metadata }: { metadata: any }) {
  if (!metadata) return null

  const resolved: ResolvedMetadata = await resolveMetadata(metadata)
  return (
    <>
      <ResolvedBasicMetadata metadata={resolved} />
      <ResolvedAlternatesMetadata metadata={resolved} />
      <ResolvedOpenGraphMetadata openGraph={resolved.openGraph} />
      <ResolvedIconsMetadata icons={resolved.icons} />
    </>
  )
}
