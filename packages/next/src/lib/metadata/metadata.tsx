import type { Metadata } from './types/metadata-interface'

import React from 'react'
import {
  AppleWebAppMeta,
  FormatDetectionMeta,
  ItunesMeta,
  BasicMetadata,
} from './generate/basic'
import { AlternatesMetadata } from './generate/alternate'
import {
  OpenGraphMetadata,
  TwitterMetadata,
  AppLinksMeta,
} from './generate/opengraph'
import { IconsMetadata } from './generate/icons'
import { accumulateMetadata } from './resolve-metadata'

// Generate the actual React elements from the resolved metadata.
export async function MetadataTree({ metadata }: { metadata: Metadata[] }) {
  if (!metadata.length) return null

  const resolved = await accumulateMetadata(metadata)

  return (
    <>
      <BasicMetadata metadata={resolved} />
      <AlternatesMetadata alternates={resolved.alternates} />
      <ItunesMeta itunes={resolved.itunes} />
      <FormatDetectionMeta formatDetection={resolved.formatDetection} />
      <AppleWebAppMeta appleWebApp={resolved.appleWebApp} />
      <OpenGraphMetadata openGraph={resolved.openGraph} />
      <TwitterMetadata twitter={resolved.twitter} />
      <AppLinksMeta appLinks={resolved.appLinks} />
      <IconsMetadata icons={resolved.icons} />
    </>
  )
}
