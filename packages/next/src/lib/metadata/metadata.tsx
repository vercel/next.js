import type { ResolvedMetadata } from './types/metadata-interface'

import React from 'react'
import {
  AppleWebAppMeta,
  FormatDetectionMeta,
  ItunesMeta,
  BasicMetadata,
} from './generate/basic'
import { AlternatesMetadata } from './generate/alternate'
import { OpenGraphMetadata, TwitterMetadata } from './generate/opengraph'
import { resolveMetadata } from './resolve-metadata'
import { IconsMetadata } from './generate/icons'

// Generate the actual React elements from the resolved metadata.
export async function Metadata({ metadata }: { metadata: any }) {
  if (!metadata) return null

  const resolved: ResolvedMetadata = await resolveMetadata(metadata)
  return (
    <>
      <BasicMetadata metadata={resolved} />
      <AlternatesMetadata alternates={resolved.alternates} />
      <ItunesMeta itunes={resolved.itunes} />
      <FormatDetectionMeta formatDetection={resolved.formatDetection} />
      <AppleWebAppMeta appleWebApp={resolved.appleWebApp} />
      <OpenGraphMetadata openGraph={resolved.openGraph} />
      <TwitterMetadata twitter={resolved.twitter} />
      <IconsMetadata icons={resolved.icons} />
    </>
  )
}
