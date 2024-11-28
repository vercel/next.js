import type { ParsedUrlQuery } from 'querystring'
import type { GetDynamicParamFromSegment } from '../../server/app-render/app-render'
import type { LoaderTree } from '../../server/lib/app-dir-module'
import type { CreateServerParamsForMetadata } from '../../server/request/params'

import { cache, cloneElement } from 'react'
import {
  AppleWebAppMeta,
  FormatDetectionMeta,
  ItunesMeta,
  BasicMeta,
  ViewportMeta,
  VerificationMeta,
  FacebookMeta,
} from './generate/basic'
import { AlternatesMetadata } from './generate/alternate'
import {
  OpenGraphMetadata,
  TwitterMetadata,
  AppLinksMeta,
} from './generate/opengraph'
import { IconsMetadata } from './generate/icons'
import {
  resolveMetadataItems,
  accumulateMetadata,
  accumulateViewport,
  type MetadataErrorType,
} from './resolve-metadata'
import { MetaFilter } from './generate/meta'
import type {
  ResolvedMetadata,
  ResolvedViewport,
} from './types/metadata-interface'
import { isHTTPAccessFallbackError } from '../../client/components/http-access-fallback/http-access-fallback'
import type { MetadataContext } from './types/resolvers'
import type { WorkStore } from '../../server/app-render/work-async-storage.external'
import {
  METADATA_BOUNDARY_NAME,
  VIEWPORT_BOUNDARY_NAME,
} from './metadata-constants'

// Use a promise to share the status of the metadata resolving,
// returning two components `MetadataTree` and `MetadataOutlet`
// `MetadataTree` is the one that will be rendered at first in the content sequence for metadata tags.
// `MetadataOutlet` is the one that will be rendered under error boundaries for metadata resolving errors.
// In this way we can let the metadata tags always render successfully,
// and the error will be caught by the error boundary and trigger fallbacks.
export function createMetadataComponents({
  tree,
  searchParams,
  metadataContext,
  getDynamicParamFromSegment,
  appUsingSizeAdjustment,
  errorType,
  createServerParamsForMetadata,
  workStore,
  MetadataBoundary,
  ViewportBoundary,
}: {
  tree: LoaderTree
  searchParams: Promise<ParsedUrlQuery>
  metadataContext: MetadataContext
  getDynamicParamFromSegment: GetDynamicParamFromSegment
  appUsingSizeAdjustment: boolean
  errorType?: MetadataErrorType | 'redirect'
  createServerParamsForMetadata: CreateServerParamsForMetadata
  workStore: WorkStore
  MetadataBoundary: (props: { children: React.ReactNode }) => React.ReactNode
  ViewportBoundary: (props: { children: React.ReactNode }) => React.ReactNode
}): [React.ComponentType, () => Promise<void>] {
  function MetadataRoot() {
    return (
      <>
        <MetadataBoundary>
          <Metadata />
        </MetadataBoundary>
        <ViewportBoundary>
          <Viewport />
        </ViewportBoundary>
        {appUsingSizeAdjustment ? (
          <meta name="next-size-adjust" content="" />
        ) : null}
      </>
    )
  }

  async function viewport() {
    return getResolvedViewport(
      tree,
      searchParams,
      getDynamicParamFromSegment,
      createServerParamsForMetadata,
      workStore,
      errorType
    )
  }

  async function Viewport() {
    try {
      return await viewport()
    } catch (error) {
      if (!errorType && isHTTPAccessFallbackError(error)) {
        try {
          return await getNotFoundViewport(
            tree,
            searchParams,
            getDynamicParamFromSegment,
            createServerParamsForMetadata,
            workStore
          )
        } catch {}
      }
      // We don't actually want to error in this component. We will
      // also error in the MetadataOutlet which causes the error to
      // bubble from the right position in the page to be caught by the
      // appropriate boundaries
      return null
    }
  }
  Viewport.displayName = VIEWPORT_BOUNDARY_NAME

  async function metadata() {
    return getResolvedMetadata(
      tree,
      searchParams,
      getDynamicParamFromSegment,
      metadataContext,
      createServerParamsForMetadata,
      workStore,
      errorType
    )
  }

  async function Metadata() {
    try {
      return await metadata()
    } catch (error) {
      if (!errorType && isHTTPAccessFallbackError(error)) {
        try {
          return await getNotFoundMetadata(
            tree,
            searchParams,
            getDynamicParamFromSegment,
            metadataContext,
            createServerParamsForMetadata,
            workStore
          )
        } catch {}
      }
      // We don't actually want to error in this component. We will
      // also error in the MetadataOutlet which causes the error to
      // bubble from the right position in the page to be caught by the
      // appropriate boundaries
      return null
    }
  }
  Metadata.displayName = METADATA_BOUNDARY_NAME

  async function getMetadataAndViewportReady(): Promise<void> {
    await viewport()
    await metadata()
    return undefined
  }

  return [MetadataRoot, getMetadataAndViewportReady]
}

const getResolvedMetadata = cache(getResolvedMetadataImpl)
async function getResolvedMetadataImpl(
  tree: LoaderTree,
  searchParams: Promise<ParsedUrlQuery>,
  getDynamicParamFromSegment: GetDynamicParamFromSegment,
  metadataContext: MetadataContext,
  createServerParamsForMetadata: CreateServerParamsForMetadata,
  workStore: WorkStore,
  errorType?: MetadataErrorType | 'redirect'
): Promise<React.ReactNode> {
  const errorConvention = errorType === 'redirect' ? undefined : errorType

  const metadataItems = await resolveMetadataItems(
    tree,
    searchParams,
    errorConvention,
    getDynamicParamFromSegment,
    createServerParamsForMetadata,
    workStore
  )
  const elements: Array<React.ReactNode> = createMetadataElements(
    await accumulateMetadata(metadataItems, metadataContext)
  )
  return (
    <>
      {elements.map((el, index) => {
        return cloneElement(el as React.ReactElement, { key: index })
      })}
    </>
  )
}

const getNotFoundMetadata = cache(getNotFoundMetadataImpl)
async function getNotFoundMetadataImpl(
  tree: LoaderTree,
  searchParams: Promise<ParsedUrlQuery>,
  getDynamicParamFromSegment: GetDynamicParamFromSegment,
  metadataContext: MetadataContext,
  createServerParamsForMetadata: CreateServerParamsForMetadata,
  workStore: WorkStore
): Promise<React.ReactNode> {
  const notFoundErrorConvention = 'not-found'
  const notFoundMetadataItems = await resolveMetadataItems(
    tree,
    searchParams,
    notFoundErrorConvention,
    getDynamicParamFromSegment,
    createServerParamsForMetadata,
    workStore
  )

  const elements: Array<React.ReactNode> = createMetadataElements(
    await accumulateMetadata(notFoundMetadataItems, metadataContext)
  )
  return (
    <>
      {elements.map((el, index) => {
        return cloneElement(el as React.ReactElement, { key: index })
      })}
    </>
  )
}

const getResolvedViewport = cache(getResolvedViewportImpl)
async function getResolvedViewportImpl(
  tree: LoaderTree,
  searchParams: Promise<ParsedUrlQuery>,
  getDynamicParamFromSegment: GetDynamicParamFromSegment,
  createServerParamsForMetadata: CreateServerParamsForMetadata,
  workStore: WorkStore,
  errorType?: MetadataErrorType | 'redirect'
): Promise<React.ReactNode> {
  const errorConvention = errorType === 'redirect' ? undefined : errorType

  const metadataItems = await resolveMetadataItems(
    tree,
    searchParams,
    errorConvention,
    getDynamicParamFromSegment,
    createServerParamsForMetadata,
    workStore
  )
  const elements: Array<React.ReactNode> = createViewportElements(
    await accumulateViewport(metadataItems)
  )
  return (
    <>
      {elements.map((el, index) => {
        return cloneElement(el as React.ReactElement, { key: index })
      })}
    </>
  )
}

const getNotFoundViewport = cache(getNotFoundViewportImpl)
async function getNotFoundViewportImpl(
  tree: LoaderTree,
  searchParams: Promise<ParsedUrlQuery>,
  getDynamicParamFromSegment: GetDynamicParamFromSegment,
  createServerParamsForMetadata: CreateServerParamsForMetadata,
  workStore: WorkStore
): Promise<React.ReactNode> {
  const notFoundErrorConvention = 'not-found'
  const notFoundMetadataItems = await resolveMetadataItems(
    tree,
    searchParams,
    notFoundErrorConvention,
    getDynamicParamFromSegment,
    createServerParamsForMetadata,
    workStore
  )

  const elements: Array<React.ReactNode> = createViewportElements(
    await accumulateViewport(notFoundMetadataItems)
  )
  return (
    <>
      {elements.map((el, index) => {
        return cloneElement(el as React.ReactElement, { key: index })
      })}
    </>
  )
}

function createMetadataElements(metadata: ResolvedMetadata) {
  return MetaFilter([
    BasicMeta({ metadata }),
    AlternatesMetadata({ alternates: metadata.alternates }),
    ItunesMeta({ itunes: metadata.itunes }),
    FacebookMeta({ facebook: metadata.facebook }),
    FormatDetectionMeta({ formatDetection: metadata.formatDetection }),
    VerificationMeta({ verification: metadata.verification }),
    AppleWebAppMeta({ appleWebApp: metadata.appleWebApp }),
    OpenGraphMetadata({ openGraph: metadata.openGraph }),
    TwitterMetadata({ twitter: metadata.twitter }),
    AppLinksMeta({ appLinks: metadata.appLinks }),
    IconsMetadata({ icons: metadata.icons }),
  ])
}

function createViewportElements(viewport: ResolvedViewport) {
  return MetaFilter([ViewportMeta({ viewport: viewport })])
}
