import React, { cache, cloneElement } from 'react'
import type { ParsedUrlQuery } from 'querystring'
import type { GetDynamicParamFromSegment } from '../../server/app-render/app-render'
import type { LoaderTree } from '../../server/lib/app-dir-module'
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
import { createServerSearchParamsForMetadata } from '../../server/request/search-params'
import { createServerPathnameForMetadata } from '../../server/request/pathname'
import { isPostpone } from '../../server/lib/router-utils/is-postpone'

import {
  MetadataBoundary,
  ViewportBoundary,
  OutletBoundary,
} from '../framework/boundary-components'

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
  errorType,
  workStore,
}: {
  tree: LoaderTree
  pathname: string
  parsedQuery: SearchParams
  metadataContext: MetadataContext
  getDynamicParamFromSegment: GetDynamicParamFromSegment
  errorType?: MetadataErrorType | 'redirect'
  workStore: WorkStore
  serveStreamingMetadata: boolean
}): {
  Viewport: React.ComponentType
  Metadata: React.ComponentType
  MetadataOutlet: React.ComponentType
} {
  const searchParams = createServerSearchParamsForMetadata(
    parsedQuery,
    workStore
  )
  const pathnameForMetadata = createServerPathnameForMetadata(
    pathname,
    workStore
  )

  // Metadata must be part of the initial SSR HTML response for React's server-side
  // hoisting to work. When metadata is sent via RSC Flight data, it bypasses React's
  // hoisting logic and stays in <body>. Therefore, we always await metadata to ensure
  // it's included in the initial HTML where React can properly hoist it to <head>.
  async function Viewport() {
    const viewportTags = await getResolvedViewport(
      tree,
      searchParams,
      getDynamicParamFromSegment,
      workStore,
      errorType
    ).catch((viewportErr) => {
      // When Legacy PPR is enabled viewport can reject with a Postpone type
      // This will go away once Legacy PPR is removed and dynamic metadata will
      // stay pending until after the prerender is complete when it is dynamic
      if (isPostpone(viewportErr)) {
        throw viewportErr
      }
      if (!errorType && isHTTPAccessFallbackError(viewportErr)) {
        return getNotFoundViewport(
          tree,
          searchParams,
          getDynamicParamFromSegment,
          workStore
        ).catch(() => null)
      }
      // We're going to throw the error from the metadata outlet so we just render null here instead
      return null
    })

    return <ViewportBoundary>{viewportTags}</ViewportBoundary>
  }
  Viewport.displayName = 'Next.Viewport'

  async function Metadata() {
    const metadataTags = await getResolvedMetadata(
      tree,
      pathnameForMetadata,
      searchParams,
      getDynamicParamFromSegment,
      metadataContext,
      workStore,
      errorType
    ).catch((metadataErr) => {
      // When Legacy PPR is enabled metadata can reject with a Postpone type
      // This will go away once Legacy PPR is removed and dynamic metadata will
      // stay pending until after the prerender is complete when it is dynamic
      if (isPostpone(metadataErr)) {
        throw metadataErr
      }
      if (!errorType && isHTTPAccessFallbackError(metadataErr)) {
        return getNotFoundMetadata(
          tree,
          pathnameForMetadata,
          searchParams,
          getDynamicParamFromSegment,
          metadataContext,
          workStore
        ).catch(() => null)
      }
      // We're going to throw the error from the metadata outlet so we just render null here instead
      return null
    })

    return <MetadataBoundary>{metadataTags}</MetadataBoundary>
  }
  Metadata.displayName = 'Next.Metadata'

  function MetadataOutlet() {
    const pendingOutlet = Promise.all([
      getResolvedMetadata(
        tree,
        pathnameForMetadata,
        searchParams,
        getDynamicParamFromSegment,
        metadataContext,
        workStore,
        errorType
      ),
      getResolvedViewport(
        tree,
        searchParams,
        getDynamicParamFromSegment,
        workStore,
        errorType
      ),
    ]).then(() => null)

    return <OutletBoundary>{pendingOutlet}</OutletBoundary>
  }
  MetadataOutlet.displayName = 'Next.MetadataOutlet'

  return {
    Viewport,
    Metadata,
    MetadataOutlet,
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
