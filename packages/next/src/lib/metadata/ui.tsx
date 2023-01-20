import React from 'react'

import type { ResolvedMetadata } from './types/metadata-interface'
import { ResolvedBasicMetadata } from './generate/basic'
import { ResolvedAlternatesMetadata } from './generate/alternate'
import { ResolvedOpenGraphMetadata } from './generate/opengraph'
import { resolveMetadata } from './resolve-metadata'

// Generate the actual React elements from the resolved metadata.
export async function Metadata({ metadata }: { metadata: any }) {
  const resolved: ResolvedMetadata = await resolveMetadata(metadata)
  return (
    <>
      <ResolvedBasicMetadata metadata={resolved} />
      <ResolvedAlternatesMetadata metadata={resolved} />
      <ResolvedOpenGraphMetadata openGraph={resolved.openGraph} />
    </>
  )
}
