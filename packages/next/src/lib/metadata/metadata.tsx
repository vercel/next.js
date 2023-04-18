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
import {
  accumulateMetadata,
  collectMetadata,
  MetadataItems,
} from './resolve-metadata'
import { PAGE_SEGMENT_KEY } from '../../shared/lib/constants'
import { LoaderTree } from '../../server/lib/app-dir-module'
import { GetDynamicParamFromSegment } from '../../server/app-render/app-render'

async function resolveMetadata({
  tree,
  parentParams,
  metadataItems,
  treePrefix = [],
  getDynamicParamFromSegment,
  searchParams,
}: {
  tree: LoaderTree
  parentParams: { [key: string]: any }
  metadataItems: MetadataItems
  /** Provided tree can be nested subtree, this argument says what is the path of such subtree */
  treePrefix?: string[]
  getDynamicParamFromSegment: GetDynamicParamFromSegment
  searchParams: { [key: string]: any }
}): Promise<MetadataItems> {
  const [segment, parallelRoutes, { page }] = tree
  const currentTreePrefix = [...treePrefix, segment]
  const isPage = typeof page !== 'undefined'
  // Handle dynamic segment params.
  const segmentParam = getDynamicParamFromSegment(segment)
  /**
   * Create object holding the parent params and current params
   */
  const currentParams =
    // Handle null case where dynamic param is optional
    segmentParam && segmentParam.value !== null
      ? {
          ...parentParams,
          [segmentParam.param]: segmentParam.value,
        }
      : // Pass through parent params to children
        parentParams

  const layerProps = {
    params: currentParams,
    ...(isPage && { searchParams }),
  }

  await collectMetadata({
    tree,
    metadataItems,
    props: layerProps,
    route: currentTreePrefix
      // __PAGE__ shouldn't be shown in a route
      .filter((s) => s !== PAGE_SEGMENT_KEY)
      .join('/'),
  })

  for (const key in parallelRoutes) {
    const childTree = parallelRoutes[key]
    await resolveMetadata({
      tree: childTree,
      metadataItems,
      parentParams: currentParams,
      treePrefix: currentTreePrefix,
      searchParams,
      getDynamicParamFromSegment,
    })
  }

  return metadataItems
}

// Generate the actual React elements from the resolved metadata.
export async function MetadataTree({
  tree,
  // metadata,
  pathname,
  searchParams,
  getDynamicParamFromSegment,
}: {
  // metadata: MetadataItems
  tree: LoaderTree
  pathname: string
  searchParams: { [key: string]: any }
  getDynamicParamFromSegment: GetDynamicParamFromSegment
}) {
  const options = {
    pathname,
  }
  const metadata = await resolveMetadata({
    tree,
    parentParams: {},
    metadataItems: [],
    searchParams,
    getDynamicParamFromSegment,
  })
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
