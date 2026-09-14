import React, { Suspense, cache } from 'react'
import type { ParsedUrlQuery } from 'querystring'
import type { Params } from '../../server/request/params'
import type { LoaderTree } from '../../server/lib/app-dir-module'
import type { SearchParams } from '../../server/request/search-params'
import {
  type MetadataErrorType,
  createSelectedMetadata,
  resolveMetadata,
  resolveViewport,
} from './resolve-metadata'
import { isHTTPAccessFallbackError } from '../../client/components/http-access-fallback/http-access-fallback'
import type { MetadataContext } from './types/resolvers'
import { createServerSearchParamsForMetadata } from '../../server/request/search-params'
import { createServerPathnameForMetadata } from '../../server/request/pathname'

import {
  MetadataBoundary,
  ViewportBoundary,
  OutletBoundary,
} from '../framework/boundary-components'
import {
  createMetadataElements,
  createViewportElements,
} from './metadata-elements'

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
  interpolatedParams,
  errorType,
  serveStreamingMetadata,
}: {
  tree: LoaderTree
  pathname: string
  parsedQuery: SearchParams
  metadataContext: MetadataContext
  interpolatedParams: Params
  errorType?: MetadataErrorType | 'redirect'
  serveStreamingMetadata: boolean
}): {
  Viewport: React.ComponentType
  Metadata: React.ComponentType
  MetadataOutlet: React.ComponentType<{ tree: LoaderTree }>
} {
  const searchParams = createServerSearchParamsForMetadata(parsedQuery)
  const pathnameForMetadata = createServerPathnameForMetadata(pathname)

  async function Viewport() {
    const tags = await getResolvedViewport(
      tree,
      searchParams,
      interpolatedParams,
      errorType
    ).catch((viewportErr) => {
      if (!errorType && isHTTPAccessFallbackError(viewportErr)) {
        return getNotFoundViewport(
          tree,
          searchParams,
          interpolatedParams
        ).catch(() => null)
      }
      // We're going to throw the error from the metadata outlet so we just render null here instead
      return null
    })

    return tags
  }
  Viewport.displayName = 'Next.Viewport'

  function ViewportWrapper() {
    return (
      <ViewportBoundary>
        <Viewport />
      </ViewportBoundary>
    )
  }

  async function Metadata() {
    const tags = await getResolvedMetadata(
      tree,
      pathnameForMetadata,
      searchParams,
      interpolatedParams,
      metadataContext,
      errorType
    ).catch((metadataErr) => {
      if (!errorType && isHTTPAccessFallbackError(metadataErr)) {
        return getNotFoundMetadata(
          tree,
          pathnameForMetadata,
          searchParams,
          interpolatedParams,
          metadataContext
        ).catch(() => null)
      }
      // We're going to throw the error from the metadata outlet so we just render null here instead
      return null
    })

    return tags
  }
  Metadata.displayName = 'Next.Metadata'

  function MetadataWrapper() {
    // TODO: We shouldn't change what we render based on whether we are streaming or not.
    // If we aren't streaming we should just block the response until we have resolved the
    // metadata.
    if (!serveStreamingMetadata) {
      return (
        <MetadataBoundary>
          <Metadata />
        </MetadataBoundary>
      )
    }
    return (
      <div hidden>
        <MetadataBoundary>
          <Suspense name="Next.Metadata">
            <Metadata />
          </Suspense>
        </MetadataBoundary>
      </div>
    )
  }

  function MetadataOutlet() {
    const pendingOutlet = Promise.all([
      getResolvedMetadata(
        tree,
        pathnameForMetadata,
        searchParams,
        interpolatedParams,
        metadataContext,
        errorType
      ),
      getResolvedViewport(tree, searchParams, interpolatedParams, errorType),
    ]).then(() => null)

    // TODO: We shouldn't change what we render based on whether we are streaming or not.
    // If we aren't streaming we should just block the response until we have resolved the
    // metadata.
    if (!serveStreamingMetadata) {
      return <OutletBoundary>{pendingOutlet}</OutletBoundary>
    }
    return (
      <OutletBoundary>
        <Suspense name="Next.MetadataOutlet">{pendingOutlet}</Suspense>
      </OutletBoundary>
    )
  }
  MetadataOutlet.displayName = 'Next.MetadataOutlet'

  return {
    Viewport: ViewportWrapper,
    Metadata: MetadataWrapper,
    MetadataOutlet,
  }
}

const getResolvedMetadata = cache(getResolvedMetadataImpl)
async function getResolvedMetadataImpl(
  tree: LoaderTree,
  pathname: Promise<string>,
  searchParams: Promise<ParsedUrlQuery>,
  interpolatedParams: Params,
  metadataContext: MetadataContext,
  errorType?: MetadataErrorType | 'redirect'
): Promise<React.ReactNode> {
  const errorConvention = errorType === 'redirect' ? undefined : errorType
  return renderMetadata(
    tree,
    pathname,
    searchParams,
    interpolatedParams,
    metadataContext,
    errorConvention
  )
}

const getNotFoundMetadata = cache(getNotFoundMetadataImpl)
async function getNotFoundMetadataImpl(
  tree: LoaderTree,
  pathname: Promise<string>,
  searchParams: Promise<ParsedUrlQuery>,
  interpolatedParams: Params,
  metadataContext: MetadataContext
): Promise<React.ReactNode> {
  const notFoundErrorConvention = 'not-found'
  return renderMetadata(
    tree,
    pathname,
    searchParams,
    interpolatedParams,
    metadataContext,
    notFoundErrorConvention
  )
}

const getResolvedViewport = cache(getResolvedViewportImpl)
async function getResolvedViewportImpl(
  tree: LoaderTree,
  searchParams: Promise<ParsedUrlQuery>,
  interpolatedParams: Params,
  errorType?: MetadataErrorType | 'redirect'
): Promise<React.ReactNode> {
  const errorConvention = errorType === 'redirect' ? undefined : errorType
  return renderViewport(tree, searchParams, interpolatedParams, errorConvention)
}

const getNotFoundViewport = cache(getNotFoundViewportImpl)
async function getNotFoundViewportImpl(
  tree: LoaderTree,
  searchParams: Promise<ParsedUrlQuery>,
  interpolatedParams: Params
): Promise<React.ReactNode> {
  const notFoundErrorConvention = 'not-found'
  return renderViewport(
    tree,
    searchParams,
    interpolatedParams,
    notFoundErrorConvention
  )
}

async function renderMetadata(
  tree: LoaderTree,
  pathname: Promise<string>,
  searchParams: Promise<ParsedUrlQuery>,
  interpolatedParams: Params,
  metadataContext: MetadataContext,
  errorConvention?: MetadataErrorType
) {
  const resolvedMetadata = await resolveMetadata(
    tree,
    pathname,
    searchParams,
    errorConvention,
    interpolatedParams,
    metadataContext
  )
  return <>{createMetadataElements(createSelectedMetadata(resolvedMetadata))}</>
}

async function renderViewport(
  tree: LoaderTree,
  searchParams: Promise<ParsedUrlQuery>,
  interpolatedParams: Params,
  errorConvention?: MetadataErrorType
) {
  const resolvedViewport = await resolveViewport(
    tree,
    searchParams,
    errorConvention,
    interpolatedParams
  )
  return <>{createViewportElements(resolvedViewport)}</>
}
