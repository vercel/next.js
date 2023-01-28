import type { ResolvedMetadata } from './types/metadata-interface'

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

// Generate the actual React elements from the resolved metadata.
export async function Metadata({ metadata }: { metadata: ResolvedMetadata }) {
  if (!metadata) return null

  return (
    <>
      <BasicMetadata metadata={metadata} />
      <AlternatesMetadata alternates={metadata.alternates} />
      <ItunesMeta itunes={metadata.itunes} />
      <FormatDetectionMeta formatDetection={metadata.formatDetection} />
      <AppleWebAppMeta appleWebApp={metadata.appleWebApp} />
      <OpenGraphMetadata openGraph={metadata.openGraph} />
      <TwitterMetadata twitter={metadata.twitter} />
      <AppLinksMeta appLinks={metadata.appLinks} />
      <IconsMetadata icons={metadata.icons} />
    </>
  )
}
