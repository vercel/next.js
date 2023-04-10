import React from 'react'
import {
  AppleWebAppMeta,
  FormatDetectionMeta,
  ItunesMeta,
  BasicMetadata,
  VerificationMeta,
} from './generate/basic'
import { AlternatesMetadata } from './generate/alternate'
import {
  OpenGraphMetadata,
  TwitterMetadata,
  AppLinksMeta,
} from './generate/opengraph'
import { IconsMetadata } from './generate/icons'
import { accumulateMetadata, MetadataItems } from './resolve-metadata'

// Generate the actual React elements from the resolved metadata.
export async function MetadataTree({
  metadata,
  pathname,
}: {
  metadata: MetadataItems
  pathname: string
  allowFallbackMetadataBase: boolean
}) {
  const options = {
    pathname,
  }
  const resolved = await accumulateMetadata(metadata, options)

  return (
    <>
      <BasicMetadata metadata={resolved} />
      <AlternatesMetadata alternates={resolved.alternates} />
      <ItunesMeta itunes={resolved.itunes} />
      <FormatDetectionMeta formatDetection={resolved.formatDetection} />
      <VerificationMeta verification={resolved.verification} />
      <AppleWebAppMeta appleWebApp={resolved.appleWebApp} />
      <OpenGraphMetadata openGraph={resolved.openGraph} />
      <TwitterMetadata twitter={resolved.twitter} />
      <AppLinksMeta appLinks={resolved.appLinks} />
      <IconsMetadata icons={resolved.icons} />
    </>
  )
}
