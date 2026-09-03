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
        if (selected.status === 'resolved' && selected.value !== undefined) {
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
            resolution.selectedViewportKeyPath
          )
          if (
            convention.status === 'resolved' &&
            convention.value !== undefined
          ) {
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

  // Metadata resolution must start while rendering so it observes the current
  // work unit store.
  function getSelectedMetadata() {
    return getResolvedParallelMetadata(
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
  }

  async function Metadata() {
    return await getSelectedMetadata()
  }
  Metadata.displayName = 'Next.Metadata'

  function MetadataBlocker() {
    return serveStreamingMetadata
      ? null
      : getSelectedMetadata().then(() => null)
  }

  function MetadataWrapper() {
    // Keep the same component structure in streaming and blocking renders.
    // The blocker only holds the shell open when metadata must not stream.
    // React requires top-level suspenseful metadata to be nested under a host
    // element. Otherwise it becomes part of the document preamble and blocks
    // shell flushing instead of streaming. Metadata tags are hoisted out, so
    // this hidden wrapper remains empty.
    return (
      <MetadataBoundary>
        <div hidden>
          <Suspense name="Next.Metadata">
            <Metadata />
          </Suspense>
        </div>
        <MetadataBlocker />
      </MetadataBoundary>
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
    const streamingOutlet = serveStreamingMetadata ? pendingOutlet : null
    const blockingOutlet = serveStreamingMetadata ? null : pendingOutlet

    // Intentionally keep two outlet positions. During PPR, prerender and
    // resume can disagree about whether metadata should block because the
    // request's user agent is only known at resume time. Conditionally adding
    // or removing Suspense would then change the React tree between phases.
    //
    // Route the promise to exactly one stable position: inside Suspense when
    // streaming, or outside it when blocking so navigation and regular errors
    // follow the unsuspended path. The outlet and the unused position both
    // render null, so this changes control flow without changing the DOM.
    return (
      <OutletBoundary>
        <Suspense name="Next.MetadataOutlet">{streamingOutlet}</Suspense>
        {blockingOutlet}
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
  if (selected.status === 'resolved' && selected.value !== undefined) {
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
      resolution.selectedMetadataKeyPath
    )
    if (convention.status === 'resolved' && convention.value !== undefined) {
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
