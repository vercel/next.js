import type { ParsedUrlQuery } from 'querystring'
import type { GetDynamicParamFromSegment } from '../../server/app-render/app-render'
import type { LoaderTree } from '../../server/lib/app-dir-module'
import type { CreateServerParamsForMetadata } from '../../server/request/params'

import { Suspense, cache, cloneElement } from 'react'
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
import { AsyncMetadata } from './async-metadata'
import { isPostpone } from '../../server/lib/router-utils/is-postpone'

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
  serveStreamingMetadata,
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
  serveStreamingMetadata: boolean
}): {
  MetadataTree: React.ComponentType
  ViewportTree: React.ComponentType
  getMetadataReady: () => Promise<void>
  getViewportReady: () => Promise<void>
} {
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

  function metadata() {
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

  async function resolveFinalMetadata() {
    try {
      return await metadata()
    } catch (metadataErr) {
      if (!errorType && isHTTPAccessFallbackError(metadataErr)) {
        try {
          return await getNotFoundMetadata(
            tree,
            searchParams,
            getDynamicParamFromSegment,
            metadataContext,
            createServerParamsForMetadata,
            workStore
          )
        } catch (notFoundMetadataErr) {
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
      return null
    }
  }
  async function Metadata() {
    const promise = resolveFinalMetadata()
    if (serveStreamingMetadata) {
      return (
        <Suspense fallback={null}>
          <AsyncMetadata promise={promise} />
        </Suspense>
      )
    }
    return await promise
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

  return {
    ViewportTree,
    MetadataTree,
    getViewportReady,
    getMetadataReady,
  }
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
  return renderMetadata(
    tree,
    searchParams,
    getDynamicParamFromSegment,
    metadataContext,
    createServerParamsForMetadata,
    workStore,
    errorConvention
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
  return renderMetadata(
    tree,
    searchParams,
    getDynamicParamFromSegment,
    metadataContext,
    createServerParamsForMetadata,
    workStore,
    notFoundErrorConvention
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
  return renderViewport(
    tree,
    searchParams,
    getDynamicParamFromSegment,
    createServerParamsForMetadata,
    workStore,
    errorConvention
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
  return renderViewport(
    tree,
    searchParams,
    getDynamicParamFromSegment,
    createServerParamsForMetadata,
    workStore,
    notFoundErrorConvention
  )
}

async function renderMetadata(
  tree: LoaderTree,
  searchParams: Promise<ParsedUrlQuery>,
  getDynamicParamFromSegment: GetDynamicParamFromSegment,
  metadataContext: MetadataContext,
  createServerParamsForMetadata: CreateServerParamsForMetadata,
  workStore: WorkStore,
  errorConvention?: MetadataErrorType
) {
  const resolvedMetadata = await resolveMetadata(
    tree,
    searchParams,
    errorConvention,
    getDynamicParamFromSegment,
    createServerParamsForMetadata,
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
  createServerParamsForMetadata: CreateServerParamsForMetadata,
  workStore: WorkStore,
  errorConvention?: MetadataErrorType
) {
  const notFoundResolvedViewport = await resolveViewport(
    tree,
    searchParams,
    errorConvention,
    getDynamicParamFromSegment,
    createServerParamsForMetadata,
    workStore
  )

  const elements: Array<React.ReactNode> = createViewportElements(
    notFoundResolvedViewport
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
