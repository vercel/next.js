import React, { Suspense, cache } from 'react'
import type { ParsedUrlQuery } from 'querystring'
import type { Params } from '../../server/request/params'
import type { LoaderTree } from '../../server/lib/app-dir-module'
import type { SearchParams } from '../../server/request/search-params'
import { createServerSearchParamsForMetadata } from '../../server/request/search-params'
import { createServerPathnameForMetadata } from '../../server/request/pathname'
import type { MetadataErrorType } from './metadata-resolution-primitives'
import {
  resolveMetadataForBranch,
  resolveMetadataResolution,
  resolveViewportForBranch,
} from './resolve-metadata-parallel'
import type { MetadataContext } from './types/resolvers'
import { createMetadataElements, createViewportElements } from './metadata'
import {
  MetadataBoundary,
  ViewportBoundary,
  OutletBoundary,
} from '../framework/boundary-components'

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
    const tags = await getMetadataResolution(
      tree,
      pathnameForMetadata,
      searchParams,
      interpolatedParams,
      metadataContext,
      errorType
    )
      .then(async (resolution) => {
        const selected = await resolution.selectedViewport
        if (selected.status === 'resolved') {
          return <>{createViewportElements(selected.value)}</>
        }
        if (
          !errorType &&
          (selected.status === 'not-found' ||
            selected.status === 'forbidden' ||
            selected.status === 'unauthorized')
        ) {
          const convention = await getViewportForBranch(
            tree,
            pathnameForMetadata,
            searchParams,
            selected.status,
            interpolatedParams,
            metadataContext,
            resolution.selectedKeyPath
          )
          if (convention.status === 'resolved') {
            return <>{createViewportElements(convention.value)}</>
          }
        }
        return null
      })
      .catch(() => {
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
    const tags = await getResolvedParallelMetadata(
      tree,
      pathnameForMetadata,
      searchParams,
      interpolatedParams,
      metadataContext,
      errorType
    ).catch(() => {
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

  function MetadataOutlet({ tree: outletTree }: { tree: LoaderTree }) {
    const metadataResolution = getMetadataResolution(
      tree,
      pathnameForMetadata,
      searchParams,
      interpolatedParams,
      metadataContext,
      errorType
    )
    const pendingOutlet = metadataResolution.then(
      (resolution) => resolution.outlets.get(outletTree) ?? null
    )

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

const getResolvedParallelMetadata = cache(getResolvedParallelMetadataImpl)
async function getResolvedParallelMetadataImpl(
  tree: LoaderTree,
  pathname: Promise<string>,
  searchParams: Promise<ParsedUrlQuery>,
  interpolatedParams: Params,
  metadataContext: MetadataContext,
  errorType: MetadataErrorType | 'redirect' | undefined
): Promise<React.ReactNode> {
  const resolution = await getMetadataResolution(
    tree,
    pathname,
    searchParams,
    interpolatedParams,
    metadataContext,
    errorType
  )
  const selected = await resolution.selectedMetadata
  if (selected.status === 'resolved') {
    return <>{createMetadataElements(selected.value)}</>
  }
  if (
    !errorType &&
    (selected.status === 'not-found' ||
      selected.status === 'forbidden' ||
      selected.status === 'unauthorized')
  ) {
    const convention = await getMetadataForBranch(
      tree,
      pathname,
      searchParams,
      selected.status,
      interpolatedParams,
      metadataContext,
      resolution.selectedKeyPath
    )
    if (convention.status === 'resolved') {
      return <>{createMetadataElements(convention.value)}</>
    }
  }
  return null
}

const getMetadataResolution = cache(resolveMetadataResolutionImpl)
async function resolveMetadataResolutionImpl(
  tree: LoaderTree,
  pathname: Promise<string>,
  searchParams: Promise<ParsedUrlQuery>,
  interpolatedParams: Params,
  metadataContext: MetadataContext,
  errorType?: MetadataErrorType | 'redirect'
) {
  const errorConvention = errorType === 'redirect' ? undefined : errorType
  return resolveMetadataResolution(
    tree,
    pathname,
    searchParams,
    errorConvention,
    interpolatedParams,
    metadataContext
  )
}

const getMetadataForBranch = cache(resolveMetadataForBranch)
const getViewportForBranch = cache(resolveViewportForBranch)
