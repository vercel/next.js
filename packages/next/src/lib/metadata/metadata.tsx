import React, { Suspense, cache, cloneElement } from 'react'
import type { ParsedUrlQuery } from 'querystring'
import type { GetDynamicParamFromSegment } from '../../server/app-render/app-render'
import type { LoaderTree } from '../../server/lib/app-dir-module'
import type { StreamingMetadataResolvedState } from '../../client/components/metadata/types'
import type { SearchParams } from '../../server/request/search-params'
import {
  AppleWebAppMeta,
  FormatDetectionMeta,
  ItunesMeta,
  BasicMeta,
  ViewportMeta,
  VerificationMeta,
  FacebookMeta,
  PinterestMeta,
} from './generate/basic'
import { AlternatesMetadata } from './generate/alternate'
import {
  OpenGraphMetadata,
  TwitterMetadata,
  AppLinksMeta,
} from './generate/opengraph'
import { IconsMetadata } from './generate/icons'
import {
  type MetadataErrorType,
  resolveMetadata,
  resolveViewport,
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
import { AsyncMetadataOutlet } from '../../client/components/metadata/async-metadata'
import { isPostpone } from '../../server/lib/router-utils/is-postpone'
import { createServerSearchParamsForMetadata } from '../../server/request/search-params'
import { createServerPathnameForMetadata } from '../../server/request/pathname'

// Use a promise to share the status of the metadata resolving,
// returning two components `MetadataTree` and `MetadataOutlet`
// `MetadataTree` is the one that will be rendered at first in the content sequence for metadata tags.
// `MetadataOutlet` is the one that will be rendered under error boundaries for metadata resolving errors.
// In this way we can let the metadata tags always render successfully,
// and the error will be caught by the error boundary and trigger fallbacks.
export function createMetadataComponents({
  tree,
  pathname,
  parsedQuery,
  metadataContext,
  getDynamicParamFromSegment,
  appUsingSizeAdjustment,
  errorType,
  workStore,
  MetadataBoundary,
  ViewportBoundary,
  serveStreamingMetadata,
}: {
  tree: LoaderTree
  pathname: string
  parsedQuery: SearchParams
  metadataContext: MetadataContext
  getDynamicParamFromSegment: GetDynamicParamFromSegment
  appUsingSizeAdjustment: boolean
  errorType?: MetadataErrorType | 'redirect'
  workStore: WorkStore
  MetadataBoundary: (props: { children: React.ReactNode }) => React.ReactNode
  ViewportBoundary: (props: { children: React.ReactNode }) => React.ReactNode
  serveStreamingMetadata: boolean
}): {
  MetadataTree: React.ComponentType
  ViewportTree: React.ComponentType
  getMetadataReady: () => Promise<void>
  getViewportReady: () => Promise<void>
  StreamingMetadataOutlet: React.ComponentType
} {
  const searchParams = createServerSearchParamsForMetadata(
    parsedQuery,
    workStore
  )
  const pathnameForMetadata = createServerPathnameForMetadata(
    pathname,
    workStore
  )

  function ViewportTree() {
    return (
      <>
        <ViewportBoundary>
          <Viewport />
        </ViewportBoundary>
        {/* This meta tag is for next/font which is still required to be blocking. */}
        {appUsingSizeAdjustment ? (
          <meta name="next-size-adjust" content="" />
        ) : null}
      </>
    )
  }

  function MetadataTree() {
    return (
      <MetadataBoundary>
        <Metadata />
      </MetadataBoundary>
    )
  }

  function viewport() {
    return getResolvedViewport(
      tree,
      searchParams,
      getDynamicParamFromSegment,
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

  function metadata() {
    return getResolvedMetadata(
      tree,
      pathnameForMetadata,
      searchParams,
      getDynamicParamFromSegment,
      metadataContext,
      workStore,
      errorType
    )
  }

  async function resolveFinalMetadata(): Promise<StreamingMetadataResolvedState> {
    let result: React.ReactNode
    let error = null
    try {
      result = await metadata()
      return {
        metadata: result,
        error: null,
        digest: undefined,
      }
    } catch (metadataErr) {
      error = metadataErr
      if (!errorType && isHTTPAccessFallbackError(metadataErr)) {
        try {
          result = await getNotFoundMetadata(
            tree,
            pathnameForMetadata,
            searchParams,
            getDynamicParamFromSegment,
            metadataContext,
            workStore
          )
          return {
            metadata: result,
            error,
            digest: (error as any)?.digest,
          }
        } catch (notFoundMetadataErr) {
          error = notFoundMetadataErr
          // In PPR rendering we still need to throw the postpone error.
          // If metadata is postponed, React needs to be aware of the location of error.
          if (serveStreamingMetadata && isPostpone(notFoundMetadataErr)) {
            throw notFoundMetadataErr
          }
        }
      }
      // In PPR rendering we still need to throw the postpone error.
      // If metadata is postponed, React needs to be aware of the location of error.
      if (serveStreamingMetadata && isPostpone(metadataErr)) {
        throw metadataErr
      }
      // We don't actually want to error in this component. We will
      // also error in the MetadataOutlet which causes the error to
      // bubble from the right position in the page to be caught by the
      // appropriate boundaries
      return {
        metadata: result,
        error,
        digest: (error as any)?.digest,
      }
    }
  }

  function Metadata() {
    if (!serveStreamingMetadata) {
      return <MetadataResolver />
    }
    return (
      <div hidden>
        <Suspense fallback={null}>
          <MetadataResolver />
        </Suspense>
      </div>
    )
  }

  async function MetadataResolver() {
    const metadataState = await resolveFinalMetadata()
    return metadataState.metadata
  }

  Metadata.displayName = METADATA_BOUNDARY_NAME

  async function getMetadataReady(): Promise<void> {
    // Only warm up metadata() call when it's blocking metadata,
    // otherwise it will be fully managed by AsyncMetadata component.
    if (!serveStreamingMetadata) {
      await metadata()
    }
    return undefined
  }

  async function getViewportReady(): Promise<void> {
    await viewport()
    return undefined
  }

  function StreamingMetadataOutlet() {
    if (serveStreamingMetadata) {
      return <AsyncMetadataOutlet promise={resolveFinalMetadata()} />
    }
    return null
  }

  return {
    ViewportTree,
    MetadataTree,
    getViewportReady,
    getMetadataReady,
    StreamingMetadataOutlet,
  }
}

const getResolvedMetadata = cache(getResolvedMetadataImpl)
async function getResolvedMetadataImpl(
  tree: LoaderTree,
  pathname: Promise<string>,
  searchParams: Promise<ParsedUrlQuery>,
  getDynamicParamFromSegment: GetDynamicParamFromSegment,
  metadataContext: MetadataContext,
  workStore: WorkStore,
  errorType?: MetadataErrorType | 'redirect'
): Promise<React.ReactNode> {
  const errorConvention = errorType === 'redirect' ? undefined : errorType
  return renderMetadata(
    tree,
    pathname,
    searchParams,
    getDynamicParamFromSegment,
    metadataContext,
    workStore,
    errorConvention
  )
}

const getNotFoundMetadata = cache(getNotFoundMetadataImpl)
async function getNotFoundMetadataImpl(
  tree: LoaderTree,
  pathname: Promise<string>,
  searchParams: Promise<ParsedUrlQuery>,
  getDynamicParamFromSegment: GetDynamicParamFromSegment,
  metadataContext: MetadataContext,
  workStore: WorkStore
): Promise<React.ReactNode> {
  const notFoundErrorConvention = 'not-found'
  return renderMetadata(
    tree,
    pathname,
    searchParams,
    getDynamicParamFromSegment,
    metadataContext,
    workStore,
    notFoundErrorConvention
  )
}

const getResolvedViewport = cache(getResolvedViewportImpl)
async function getResolvedViewportImpl(
  tree: LoaderTree,
  searchParams: Promise<ParsedUrlQuery>,
  getDynamicParamFromSegment: GetDynamicParamFromSegment,
  workStore: WorkStore,
  errorType?: MetadataErrorType | 'redirect'
): Promise<React.ReactNode> {
  const errorConvention = errorType === 'redirect' ? undefined : errorType
  return renderViewport(
    tree,
    searchParams,
    getDynamicParamFromSegment,
    workStore,
    errorConvention
  )
}

const getNotFoundViewport = cache(getNotFoundViewportImpl)
async function getNotFoundViewportImpl(
  tree: LoaderTree,
  searchParams: Promise<ParsedUrlQuery>,
  getDynamicParamFromSegment: GetDynamicParamFromSegment,
  workStore: WorkStore
): Promise<React.ReactNode> {
  const notFoundErrorConvention = 'not-found'
  return renderViewport(
    tree,
    searchParams,
    getDynamicParamFromSegment,
    workStore,
    notFoundErrorConvention
  )
}

async function renderMetadata(
  tree: LoaderTree,
  pathname: Promise<string>,
  searchParams: Promise<ParsedUrlQuery>,
  getDynamicParamFromSegment: GetDynamicParamFromSegment,
  metadataContext: MetadataContext,
  workStore: WorkStore,
  errorConvention?: MetadataErrorType
) {
  const resolvedMetadata = await resolveMetadata(
    tree,
    pathname,
    searchParams,
    errorConvention,
    getDynamicParamFromSegment,
    workStore,
    metadataContext
  )
  const elements: Array<React.ReactNode> =
    createMetadataElements(resolvedMetadata)
  return (
    <>
      {elements.map((el, index) => {
        return cloneElement(el as React.ReactElement, { key: index })
      })}
    </>
  )
}

async function renderViewport(
  tree: LoaderTree,
  searchParams: Promise<ParsedUrlQuery>,
  getDynamicParamFromSegment: GetDynamicParamFromSegment,
  workStore: WorkStore,
  errorConvention?: MetadataErrorType
) {
  const resolvedViewport = await resolveViewport(
    tree,
    searchParams,
    errorConvention,
    getDynamicParamFromSegment,
    workStore
  )

  const elements: Array<React.ReactNode> =
    createViewportElements(resolvedViewport)
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
    PinterestMeta({ pinterest: metadata.pinterest }),
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
