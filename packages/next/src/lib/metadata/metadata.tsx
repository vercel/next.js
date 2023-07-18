import type { GetDynamicParamFromSegment } from '../../server/app-render/app-render'
import type { LoaderTree } from '../../server/lib/app-dir-module'

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
import { accumulateMetadata, resolveMetadata } from './resolve-metadata'
import { MetaFilter } from './generate/meta'
import { ResolvedMetadata } from './types/metadata-interface'
import { createDefaultMetadata } from './default-metadata'
import { isNotFoundError } from '../../client/components/not-found'
import { isRedirectError } from '../../client/components/redirect'

const NEXT_METADATA_ERROR_PREFIX = 'NEXT_METADATA_ERROR;'
export function isMetadataError(error: any) {
  return error && (error?.digest + '').startsWith(NEXT_METADATA_ERROR_PREFIX)
}

// Generate the actual React elements from the resolved metadata.
export async function MetadataTree({
  tree,
  pathname,
  searchParams,
  getDynamicParamFromSegment,
  appUsingSizeAdjust,
  errorType,
}: {
  tree: LoaderTree
  pathname: string
  searchParams: { [key: string]: any }
  getDynamicParamFromSegment: GetDynamicParamFromSegment
  appUsingSizeAdjust: boolean
  errorType?: 'not-found' | 'redirect'
}) {
  const metadataContext = {
    pathname,
  }

  const resolvedMetadata = await resolveMetadata({
    tree,
    parentParams: {},
    metadataItems: [],
    searchParams,
    getDynamicParamFromSegment,
    errorConvention: errorType === 'redirect' ? undefined : errorType,
  })
  let metadata: ResolvedMetadata | undefined = undefined

  const defaultMetadata = createDefaultMetadata()
  // Skip for redirect case as for the temporary redirect case we don't need the metadata on client
  if (errorType === 'redirect') {
    metadata = defaultMetadata
  } else {
    try {
      metadata = await accumulateMetadata(resolvedMetadata, metadataContext)
    } catch (error: any) {
      if (isNotFoundError(error) || isRedirectError(error)) {
        const digest = `${NEXT_METADATA_ERROR_PREFIX}${error.digest}`
        const metadataError = new Error(digest)
        // @ts-ignore assign digest property so that the original error can be identified
        metadataError.digest = digest
        throw metadataError
      } else {
        throw error
      }
    }
  }

  const elements = MetaFilter([
    BasicMetadata({ metadata }),
    AlternatesMetadata({ alternates: metadata.alternates }),
    ItunesMeta({ itunes: metadata.itunes }),
    FormatDetectionMeta({ formatDetection: metadata.formatDetection }),
    VerificationMeta({ verification: metadata.verification }),
    AppleWebAppMeta({ appleWebApp: metadata.appleWebApp }),
    OpenGraphMetadata({ openGraph: metadata.openGraph }),
    TwitterMetadata({ twitter: metadata.twitter }),
    AppLinksMeta({ appLinks: metadata.appLinks }),
    IconsMetadata({ icons: metadata.icons }),
  ])

  if (appUsingSizeAdjust) elements.push(<meta name="next-size-adjust" />)

  return (
    <>
      {elements.map((el, index) => {
        return React.cloneElement(el as React.ReactElement, { key: index })
      })}
    </>
  )
}
