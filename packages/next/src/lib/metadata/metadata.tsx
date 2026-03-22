import React, { Suspense, cache } from 'react'
import type { ParsedUrlQuery } from 'querystring'
import type { Params } from '../../server/request/params'
import type { LoaderTree } from '../../server/lib/app-dir-module'
import type { SearchParams } from '../../server/request/search-params'
import {
  type MetadataErrorType,
  resolveMetadata,
  resolveViewport,
} from './resolve-metadata'
import type {
  ResolvedMetadata,
  ResolvedViewport,
} from './types/metadata-interface'
import { isHTTPAccessFallbackError } from '../../client/components/http-access-fallback/http-access-fallback'
import type { MetadataContext } from './types/resolvers'
import { createServerSearchParamsForMetadata } from '../../server/request/search-params'
import { createServerPathnameForMetadata } from '../../server/request/pathname'
import { isPostpone } from '../../server/lib/router-utils/is-postpone'
import {
  workUnitAsyncStorage,
  getStagedRenderingController,
} from '../../server/app-render/work-unit-async-storage.external'
import { RenderStage } from '../../server/app-render/staged-rendering'

import {
  MetadataBoundary,
  ViewportBoundary,
  OutletBoundary,
} from '../framework/boundary-components'

import { getOrigin } from './generate/utils'
import { IconMark } from './generate/icon-mark'

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
  isRuntimePrefetchable,
}: {
  tree: LoaderTree
  pathname: string
  parsedQuery: SearchParams
  metadataContext: MetadataContext
  interpolatedParams: Params
  errorType?: MetadataErrorType | 'redirect'
  serveStreamingMetadata: boolean
  isRuntimePrefetchable: boolean
}): {
  Viewport: React.ComponentType
  Metadata: React.ComponentType
  MetadataOutlet: React.ComponentType
} {
  const searchParams = createServerSearchParamsForMetadata(
    parsedQuery,
    isRuntimePrefetchable
  )
  const pathnameForMetadata = createServerPathnameForMetadata(pathname)

  async function Viewport() {
    // Gate metadata to the correct render stage. If the page is not
    // runtime-prefetchable, defer until the Static stage so that
    // prefetchable segments get a head start.
    if (!isRuntimePrefetchable) {
      const workUnitStore = workUnitAsyncStorage.getStore()
      if (workUnitStore) {
        const stagedRendering = getStagedRenderingController(workUnitStore)
        if (stagedRendering) {
          await stagedRendering.waitForStage(RenderStage.Static)
        }
      }
    }

    const tags = await getResolvedViewport(
      tree,
      searchParams,
      interpolatedParams,
      isRuntimePrefetchable,
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
          interpolatedParams,
          isRuntimePrefetchable
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
    // Gate metadata to the correct render stage. If the page is not
    // runtime-prefetchable, defer until the Static stage so that
    // prefetchable segments get a head start.
    if (!isRuntimePrefetchable) {
      const workUnitStore = workUnitAsyncStorage.getStore()
      if (workUnitStore) {
        const stagedRendering = getStagedRenderingController(workUnitStore)
        if (stagedRendering) {
          await stagedRendering.waitForStage(RenderStage.Static)
        }
      }
    }

    const tags = await getResolvedMetadata(
      tree,
      pathnameForMetadata,
      searchParams,
      interpolatedParams,
      metadataContext,
      isRuntimePrefetchable,
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
          interpolatedParams,
          metadataContext,
          isRuntimePrefetchable
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
        isRuntimePrefetchable,
        errorType
      ),
      getResolvedViewport(
        tree,
        searchParams,
        interpolatedParams,
        isRuntimePrefetchable,
        errorType
      ),
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
  isRuntimePrefetchable: boolean,
  errorType?: MetadataErrorType | 'redirect'
): Promise<React.ReactNode> {
  const errorConvention = errorType === 'redirect' ? undefined : errorType
  return renderMetadata(
    tree,
    pathname,
    searchParams,
    interpolatedParams,
    metadataContext,
    isRuntimePrefetchable,
    errorConvention
  )
}

const getNotFoundMetadata = cache(getNotFoundMetadataImpl)
async function getNotFoundMetadataImpl(
  tree: LoaderTree,
  pathname: Promise<string>,
  searchParams: Promise<ParsedUrlQuery>,
  interpolatedParams: Params,
  metadataContext: MetadataContext,
  isRuntimePrefetchable: boolean
): Promise<React.ReactNode> {
  const notFoundErrorConvention = 'not-found'
  return renderMetadata(
    tree,
    pathname,
    searchParams,
    interpolatedParams,
    metadataContext,
    isRuntimePrefetchable,
    notFoundErrorConvention
  )
}

const getResolvedViewport = cache(getResolvedViewportImpl)
async function getResolvedViewportImpl(
  tree: LoaderTree,
  searchParams: Promise<ParsedUrlQuery>,
  interpolatedParams: Params,
  isRuntimePrefetchable: boolean,
  errorType?: MetadataErrorType | 'redirect'
): Promise<React.ReactNode> {
  const errorConvention = errorType === 'redirect' ? undefined : errorType
  return renderViewport(
    tree,
    searchParams,
    interpolatedParams,
    isRuntimePrefetchable,
    errorConvention
  )
}

const getNotFoundViewport = cache(getNotFoundViewportImpl)
async function getNotFoundViewportImpl(
  tree: LoaderTree,
  searchParams: Promise<ParsedUrlQuery>,
  interpolatedParams: Params,
  isRuntimePrefetchable: boolean
): Promise<React.ReactNode> {
  const notFoundErrorConvention = 'not-found'
  return renderViewport(
    tree,
    searchParams,
    interpolatedParams,
    isRuntimePrefetchable,
    notFoundErrorConvention
  )
}

async function renderMetadata(
  tree: LoaderTree,
  pathname: Promise<string>,
  searchParams: Promise<ParsedUrlQuery>,
  interpolatedParams: Params,
  metadataContext: MetadataContext,
  isRuntimePrefetchable: boolean,
  errorConvention?: MetadataErrorType
) {
  const resolvedMetadata = await resolveMetadata(
    tree,
    pathname,
    searchParams,
    errorConvention,
    interpolatedParams,
    metadataContext,
    isRuntimePrefetchable
  )
  return <>{createMetadataElements(resolvedMetadata)}</>
}

async function renderViewport(
  tree: LoaderTree,
  searchParams: Promise<ParsedUrlQuery>,
  interpolatedParams: Params,
  isRuntimePrefetchable: boolean,
  errorConvention?: MetadataErrorType
) {
  const resolvedViewport = await resolveViewport(
    tree,
    searchParams,
    errorConvention,
    interpolatedParams,
    isRuntimePrefetchable
  )
  return <>{createViewportElements(resolvedViewport)}</>
}

// ---------------------------------------------------------------------------
// Viewport tag rendering
// ---------------------------------------------------------------------------

function createViewportElements(
  viewport: ResolvedViewport
): React.ReactElement[] {
  const tags: React.ReactElement[] = []
  let i = 0

  tags.push(<meta key={i++} charSet="utf-8" />)

  // Build viewport content string from layout properties
  const viewportParts: string[] = []
  if (viewport.width != null) {
    viewportParts.push(`width=${viewport.width}`)
  }
  if (viewport.height != null) {
    viewportParts.push(`height=${viewport.height}`)
  }
  if (viewport.initialScale != null) {
    viewportParts.push(`initial-scale=${viewport.initialScale}`)
  }
  if (viewport.minimumScale != null) {
    viewportParts.push(`minimum-scale=${viewport.minimumScale}`)
  }
  if (viewport.maximumScale != null) {
    viewportParts.push(`maximum-scale=${viewport.maximumScale}`)
  }
  if (viewport.userScalable != null) {
    viewportParts.push(`user-scalable=${viewport.userScalable ? 'yes' : 'no'}`)
  }
  if (viewport.viewportFit) {
    viewportParts.push(`viewport-fit=${viewport.viewportFit}`)
  }
  if (viewport.interactiveWidget) {
    viewportParts.push(`interactive-widget=${viewport.interactiveWidget}`)
  }
  if (viewportParts.length) {
    tags.push(
      <meta key={i++} name="viewport" content={viewportParts.join(', ')} />
    )
  }

  if (viewport.themeColor) {
    for (const themeColor of viewport.themeColor) {
      if (themeColor.media) {
        tags.push(
          <meta
            key={i++}
            name="theme-color"
            content={themeColor.color}
            media={themeColor.media}
          />
        )
      } else {
        tags.push(
          <meta key={i++} name="theme-color" content={themeColor.color} />
        )
      }
    }
  }

  if (viewport.colorScheme) {
    tags.push(
      <meta key={i++} name="color-scheme" content={viewport.colorScheme} />
    )
  }

  return tags
}

// ---------------------------------------------------------------------------
// Metadata tag rendering
// ---------------------------------------------------------------------------

function createMetadataElements(
  metadata: ResolvedMetadata
): React.ReactElement[] {
  const tags: React.ReactElement[] = []
  let i = 0

  // --- Title ---
  if (metadata.title !== null && metadata.title.absolute) {
    tags.push(<title key={i++}>{metadata.title.absolute}</title>)
  }

  // --- Basic meta tags ---
  if (metadata.description) {
    tags.push(
      <meta key={i++} name="description" content={metadata.description} />
    )
  }
  if (metadata.applicationName) {
    tags.push(
      <meta
        key={i++}
        name="application-name"
        content={metadata.applicationName}
      />
    )
  }

  // --- Authors ---
  if (metadata.authors) {
    for (const author of metadata.authors) {
      if (author.url) {
        tags.push(<link key={i++} rel="author" href={author.url.toString()} />)
      }
      if (author.name) {
        tags.push(<meta key={i++} name="author" content={author.name} />)
      }
    }
  }

  // --- Manifest ---
  if (metadata.manifest) {
    const manifestOrigin = getOrigin(metadata.manifest)
    tags.push(
      <link
        key={i++}
        rel="manifest"
        href={metadata.manifest.toString()}
        crossOrigin={
          !manifestOrigin && process.env.VERCEL_ENV === 'preview'
            ? 'use-credentials'
            : undefined
        }
      />
    )
  }

  if (metadata.generator) {
    tags.push(<meta key={i++} name="generator" content={metadata.generator} />)
  }
  if (metadata.keywords && metadata.keywords.length) {
    tags.push(
      <meta key={i++} name="keywords" content={metadata.keywords.join(',')} />
    )
  }
  if (metadata.referrer) {
    tags.push(<meta key={i++} name="referrer" content={metadata.referrer} />)
  }
  if (metadata.creator) {
    tags.push(<meta key={i++} name="creator" content={metadata.creator} />)
  }
  if (metadata.publisher) {
    tags.push(<meta key={i++} name="publisher" content={metadata.publisher} />)
  }
  if (metadata.robots?.basic) {
    tags.push(<meta key={i++} name="robots" content={metadata.robots.basic} />)
  }
  if (metadata.robots?.googleBot) {
    tags.push(
      <meta key={i++} name="googlebot" content={metadata.robots.googleBot} />
    )
  }
  if (metadata.abstract) {
    tags.push(<meta key={i++} name="abstract" content={metadata.abstract} />)
  }

  // --- Link rel arrays ---
  if (metadata.archives) {
    for (const archive of metadata.archives) {
      tags.push(<link key={i++} rel="archives" href={archive} />)
    }
  }
  if (metadata.assets) {
    for (const asset of metadata.assets) {
      tags.push(<link key={i++} rel="assets" href={asset} />)
    }
  }
  if (metadata.bookmarks) {
    for (const bookmark of metadata.bookmarks) {
      tags.push(<link key={i++} rel="bookmarks" href={bookmark} />)
    }
  }

  // --- Pagination ---
  if (metadata.pagination) {
    if (metadata.pagination.previous) {
      tags.push(
        <link key={i++} rel="prev" href={metadata.pagination.previous} />
      )
    }
    if (metadata.pagination.next) {
      tags.push(<link key={i++} rel="next" href={metadata.pagination.next} />)
    }
  }

  if (metadata.category) {
    tags.push(<meta key={i++} name="category" content={metadata.category} />)
  }
  if (metadata.classification) {
    tags.push(
      <meta key={i++} name="classification" content={metadata.classification} />
    )
  }

  // --- Other (arbitrary name/value pairs) ---
  if (metadata.other) {
    for (const [name, content] of Object.entries(metadata.other)) {
      if (Array.isArray(content)) {
        for (const contentItem of content) {
          if (contentItem != null && contentItem !== '') {
            tags.push(
              <meta key={i++} name={name} content={String(contentItem)} />
            )
          }
        }
      } else if (content != null && content !== '') {
        tags.push(<meta key={i++} name={name} content={String(content)} />)
      }
    }
  }

  // --- Alternates ---
  if (metadata.alternates) {
    const { canonical, languages, media, types } = metadata.alternates

    if (canonical && canonical.url) {
      tags.push(
        <link
          key={i++}
          rel="canonical"
          href={canonical.url.toString()}
          {...(canonical.title ? { title: canonical.title } : undefined)}
        />
      )
    }

    if (languages) {
      for (const [locale, descriptors] of Object.entries(languages)) {
        if (descriptors) {
          for (const descriptor of descriptors) {
            if (descriptor.url) {
              tags.push(
                <link
                  key={i++}
                  rel="alternate"
                  hrefLang={locale}
                  href={descriptor.url.toString()}
                  {...(descriptor.title
                    ? { title: descriptor.title }
                    : undefined)}
                />
              )
            }
          }
        }
      }
    }

    if (media) {
      for (const [mediaName, descriptors] of Object.entries(media)) {
        if (descriptors) {
          for (const descriptor of descriptors) {
            if (descriptor.url) {
              tags.push(
                <link
                  key={i++}
                  rel="alternate"
                  media={mediaName}
                  href={descriptor.url.toString()}
                  {...(descriptor.title
                    ? { title: descriptor.title }
                    : undefined)}
                />
              )
            }
          }
        }
      }
    }

    if (types) {
      for (const [type, descriptors] of Object.entries(types)) {
        if (descriptors) {
          for (const descriptor of descriptors) {
            if (descriptor.url) {
              tags.push(
                <link
                  key={i++}
                  rel="alternate"
                  type={type}
                  href={descriptor.url.toString()}
                  {...(descriptor.title
                    ? { title: descriptor.title }
                    : undefined)}
                />
              )
            }
          }
        }
      }
    }
  }

  // --- iTunes ---
  if (metadata.itunes) {
    const { appId, appArgument } = metadata.itunes
    let itunesContent = `app-id=${appId}`
    if (appArgument) {
      itunesContent += `, app-argument=${appArgument}`
    }
    tags.push(
      <meta key={i++} name="apple-itunes-app" content={itunesContent} />
    )
  }

  // --- Facebook ---
  if (metadata.facebook) {
    if (metadata.facebook.appId) {
      tags.push(
        <meta
          key={i++}
          property="fb:app_id"
          content={metadata.facebook.appId}
        />
      )
    }
    if (metadata.facebook.admins) {
      for (const admin of metadata.facebook.admins) {
        tags.push(<meta key={i++} property="fb:admins" content={admin} />)
      }
    }
  }

  // --- Pinterest ---
  if (metadata.pinterest && metadata.pinterest.richPin !== undefined) {
    tags.push(
      <meta
        key={i++}
        property="pinterest-rich-pin"
        content={metadata.pinterest.richPin.toString()}
      />
    )
  }

  // --- Format Detection ---
  if (metadata.formatDetection) {
    const formatDetectionKeys = [
      'telephone',
      'date',
      'address',
      'email',
      'url',
    ] as const
    let formatContent = ''
    for (const key of formatDetectionKeys) {
      if (metadata.formatDetection[key] === false) {
        if (formatContent) formatContent += ', '
        formatContent += `${key}=no`
      }
    }
    if (formatContent) {
      tags.push(
        <meta key={i++} name="format-detection" content={formatContent} />
      )
    }
  }

  // --- Verification ---
  if (metadata.verification) {
    const verification = metadata.verification

    if (verification.google) {
      for (const value of verification.google) {
        if (value != null && value !== '') {
          tags.push(
            <meta
              key={i++}
              name="google-site-verification"
              content={String(value)}
            />
          )
        }
      }
    }
    if (verification.yahoo) {
      for (const value of verification.yahoo) {
        if (value != null && value !== '') {
          tags.push(<meta key={i++} name="y_key" content={String(value)} />)
        }
      }
    }
    if (verification.yandex) {
      for (const value of verification.yandex) {
        if (value != null && value !== '') {
          tags.push(
            <meta
              key={i++}
              name="yandex-verification"
              content={String(value)}
            />
          )
        }
      }
    }
    if (verification.me) {
      for (const value of verification.me) {
        if (value != null && value !== '') {
          tags.push(<meta key={i++} name="me" content={String(value)} />)
        }
      }
    }
    if (verification.other) {
      for (const [name, values] of Object.entries(verification.other)) {
        for (const value of values) {
          if (value != null && value !== '') {
            tags.push(<meta key={i++} name={name} content={String(value)} />)
          }
        }
      }
    }
  }

  // --- Apple Web App ---
  if (metadata.appleWebApp) {
    const { capable, title, startupImage, statusBarStyle } =
      metadata.appleWebApp

    if (capable) {
      tags.push(<meta key={i++} name="mobile-web-app-capable" content="yes" />)
    }
    if (title) {
      tags.push(
        <meta key={i++} name="apple-mobile-web-app-title" content={title} />
      )
    }
    if (startupImage) {
      for (const image of startupImage) {
        if (image.media) {
          tags.push(
            <link
              key={i++}
              href={image.url}
              media={image.media}
              rel="apple-touch-startup-image"
            />
          )
        } else {
          tags.push(
            <link key={i++} href={image.url} rel="apple-touch-startup-image" />
          )
        }
      }
    }
    if (statusBarStyle) {
      tags.push(
        <meta
          key={i++}
          name="apple-mobile-web-app-status-bar-style"
          content={statusBarStyle}
        />
      )
    }
  }

  // --- Open Graph ---
  if (metadata.openGraph) {
    const og = metadata.openGraph

    if (og.determiner) {
      tags.push(
        <meta key={i++} property="og:determiner" content={og.determiner} />
      )
    }
    if (og.title?.absolute) {
      tags.push(
        <meta key={i++} property="og:title" content={og.title.absolute} />
      )
    }
    if (og.description) {
      tags.push(
        <meta key={i++} property="og:description" content={og.description} />
      )
    }
    if (og.url) {
      tags.push(
        <meta key={i++} property="og:url" content={og.url.toString()} />
      )
    }
    if (og.siteName) {
      tags.push(
        <meta key={i++} property="og:site_name" content={og.siteName} />
      )
    }
    if (og.locale) {
      tags.push(<meta key={i++} property="og:locale" content={og.locale} />)
    }
    if (og.countryName) {
      tags.push(
        <meta key={i++} property="og:country_name" content={og.countryName} />
      )
    }
    if (og.ttl != null) {
      tags.push(
        <meta key={i++} property="og:ttl" content={og.ttl.toString()} />
      )
    }

    // OG images
    if (og.images) {
      for (const image of og.images) {
        if (typeof image === 'string') {
          tags.push(<meta key={i++} property="og:image" content={image} />)
        } else {
          if (image.url) {
            tags.push(
              <meta key={i++} property="og:image" content={String(image.url)} />
            )
          }
          if (image.secureUrl) {
            tags.push(
              <meta
                key={i++}
                property="og:image:secure_url"
                content={String(image.secureUrl)}
              />
            )
          }
          if (image.type) {
            tags.push(
              <meta key={i++} property="og:image:type" content={image.type} />
            )
          }
          if (image.width) {
            tags.push(
              <meta
                key={i++}
                property="og:image:width"
                content={String(image.width)}
              />
            )
          }
          if (image.height) {
            tags.push(
              <meta
                key={i++}
                property="og:image:height"
                content={String(image.height)}
              />
            )
          }
          if (image.alt) {
            tags.push(
              <meta key={i++} property="og:image:alt" content={image.alt} />
            )
          }
        }
      }
    }

    // OG videos
    if (og.videos) {
      for (const video of og.videos) {
        if (typeof video === 'string') {
          tags.push(<meta key={i++} property="og:video" content={video} />)
        } else {
          if (video.url) {
            tags.push(
              <meta key={i++} property="og:video" content={String(video.url)} />
            )
          }
          if (video.secureUrl) {
            tags.push(
              <meta
                key={i++}
                property="og:video:secure_url"
                content={String(video.secureUrl)}
              />
            )
          }
          if (video.type) {
            tags.push(
              <meta key={i++} property="og:video:type" content={video.type} />
            )
          }
          if (video.width) {
            tags.push(
              <meta
                key={i++}
                property="og:video:width"
                content={String(video.width)}
              />
            )
          }
          if (video.height) {
            tags.push(
              <meta
                key={i++}
                property="og:video:height"
                content={String(video.height)}
              />
            )
          }
        }
      }
    }

    // OG audio
    if (og.audio) {
      for (const audio of og.audio) {
        if (typeof audio === 'string') {
          tags.push(<meta key={i++} property="og:audio" content={audio} />)
        } else {
          if (audio.url) {
            tags.push(
              <meta key={i++} property="og:audio" content={String(audio.url)} />
            )
          }
          if (audio.secureUrl) {
            tags.push(
              <meta
                key={i++}
                property="og:audio:secure_url"
                content={String(audio.secureUrl)}
              />
            )
          }
          if (audio.type) {
            tags.push(
              <meta key={i++} property="og:audio:type" content={audio.type} />
            )
          }
        }
      }
    }

    // OG simple array properties
    if (og.emails) {
      for (const email of og.emails) {
        tags.push(<meta key={i++} property="og:email" content={email} />)
      }
    }
    if (og.phoneNumbers) {
      for (const phone of og.phoneNumbers) {
        tags.push(<meta key={i++} property="og:phone_number" content={phone} />)
      }
    }
    if (og.faxNumbers) {
      for (const fax of og.faxNumbers) {
        tags.push(<meta key={i++} property="og:fax_number" content={fax} />)
      }
    }
    if (og.alternateLocale) {
      for (const locale of og.alternateLocale) {
        tags.push(
          <meta key={i++} property="og:locale:alternate" content={locale} />
        )
      }
    }

    // OG type-specific tags
    if ('type' in og) {
      const ogType = og.type
      switch (ogType) {
        case 'website':
          tags.push(<meta key={i++} property="og:type" content="website" />)
          break

        case 'article':
          tags.push(<meta key={i++} property="og:type" content="article" />)
          if (og.publishedTime) {
            tags.push(
              <meta
                key={i++}
                property="article:published_time"
                content={og.publishedTime.toString()}
              />
            )
          }
          if (og.modifiedTime) {
            tags.push(
              <meta
                key={i++}
                property="article:modified_time"
                content={og.modifiedTime.toString()}
              />
            )
          }
          if (og.expirationTime) {
            tags.push(
              <meta
                key={i++}
                property="article:expiration_time"
                content={og.expirationTime.toString()}
              />
            )
          }
          if (og.authors) {
            for (const author of og.authors) {
              tags.push(
                <meta
                  key={i++}
                  property="article:author"
                  content={String(author)}
                />
              )
            }
          }
          if (og.section) {
            tags.push(
              <meta key={i++} property="article:section" content={og.section} />
            )
          }
          if (og.tags) {
            for (const tag of og.tags) {
              tags.push(<meta key={i++} property="article:tag" content={tag} />)
            }
          }
          break

        case 'book':
          tags.push(<meta key={i++} property="og:type" content="book" />)
          if (og.isbn) {
            tags.push(<meta key={i++} property="book:isbn" content={og.isbn} />)
          }
          if (og.releaseDate) {
            tags.push(
              <meta
                key={i++}
                property="book:release_date"
                content={og.releaseDate}
              />
            )
          }
          if (og.authors) {
            for (const author of og.authors) {
              tags.push(
                <meta
                  key={i++}
                  property="book:author"
                  content={String(author)}
                />
              )
            }
          }
          if (og.tags) {
            for (const tag of og.tags) {
              tags.push(<meta key={i++} property="book:tag" content={tag} />)
            }
          }
          break

        case 'profile':
          tags.push(<meta key={i++} property="og:type" content="profile" />)
          if (og.firstName) {
            tags.push(
              <meta
                key={i++}
                property="profile:first_name"
                content={og.firstName}
              />
            )
          }
          if (og.lastName) {
            tags.push(
              <meta
                key={i++}
                property="profile:last_name"
                content={og.lastName}
              />
            )
          }
          if (og.username) {
            tags.push(
              <meta
                key={i++}
                property="profile:username"
                content={og.username}
              />
            )
          }
          if (og.gender) {
            tags.push(
              <meta key={i++} property="profile:gender" content={og.gender} />
            )
          }
          break

        case 'music.song':
          tags.push(<meta key={i++} property="og:type" content="music.song" />)
          if (og.duration != null) {
            tags.push(
              <meta
                key={i++}
                property="music:duration"
                content={og.duration.toString()}
              />
            )
          }
          if (og.albums) {
            for (const album of og.albums) {
              if (typeof album === 'string') {
                tags.push(
                  <meta key={i++} property="music:album" content={album} />
                )
              } else {
                if (album.url) {
                  tags.push(
                    <meta
                      key={i++}
                      property="music:album"
                      content={String(album.url)}
                    />
                  )
                }
                if (album.disc != null) {
                  tags.push(
                    <meta
                      key={i++}
                      property="music:album:disc"
                      content={String(album.disc)}
                    />
                  )
                }
                if (album.track != null) {
                  tags.push(
                    <meta
                      key={i++}
                      property="music:album:track"
                      content={String(album.track)}
                    />
                  )
                }
              }
            }
          }
          if (og.musicians) {
            for (const musician of og.musicians) {
              tags.push(
                <meta
                  key={i++}
                  property="music:musician"
                  content={String(musician)}
                />
              )
            }
          }
          break

        case 'music.album':
          tags.push(<meta key={i++} property="og:type" content="music.album" />)
          if (og.songs) {
            for (const song of og.songs) {
              if (typeof song === 'string') {
                tags.push(
                  <meta key={i++} property="music:song" content={song} />
                )
              } else {
                if (song.url) {
                  tags.push(
                    <meta
                      key={i++}
                      property="music:song"
                      content={String(song.url)}
                    />
                  )
                }
                if (song.disc != null) {
                  tags.push(
                    <meta
                      key={i++}
                      property="music:song:disc"
                      content={String(song.disc)}
                    />
                  )
                }
                if (song.track != null) {
                  tags.push(
                    <meta
                      key={i++}
                      property="music:song:track"
                      content={String(song.track)}
                    />
                  )
                }
              }
            }
          }
          if (og.musicians) {
            for (const musician of og.musicians) {
              tags.push(
                <meta
                  key={i++}
                  property="music:musician"
                  content={String(musician)}
                />
              )
            }
          }
          if (og.releaseDate) {
            tags.push(
              <meta
                key={i++}
                property="music:release_date"
                content={og.releaseDate}
              />
            )
          }
          break

        case 'music.playlist':
          tags.push(
            <meta key={i++} property="og:type" content="music.playlist" />
          )
          if (og.songs) {
            for (const song of og.songs) {
              if (typeof song === 'string') {
                tags.push(
                  <meta key={i++} property="music:song" content={song} />
                )
              } else {
                if (song.url) {
                  tags.push(
                    <meta
                      key={i++}
                      property="music:song"
                      content={String(song.url)}
                    />
                  )
                }
                if (song.disc != null) {
                  tags.push(
                    <meta
                      key={i++}
                      property="music:song:disc"
                      content={String(song.disc)}
                    />
                  )
                }
                if (song.track != null) {
                  tags.push(
                    <meta
                      key={i++}
                      property="music:song:track"
                      content={String(song.track)}
                    />
                  )
                }
              }
            }
          }
          if (og.creators) {
            for (const creator of og.creators) {
              tags.push(
                <meta
                  key={i++}
                  property="music:creator"
                  content={String(creator)}
                />
              )
            }
          }
          break

        case 'music.radio_station':
          tags.push(
            <meta key={i++} property="og:type" content="music.radio_station" />
          )
          if (og.creators) {
            for (const creator of og.creators) {
              tags.push(
                <meta
                  key={i++}
                  property="music:creator"
                  content={String(creator)}
                />
              )
            }
          }
          break

        case 'video.movie':
          tags.push(<meta key={i++} property="og:type" content="video.movie" />)
          if (og.actors) {
            for (const actor of og.actors) {
              if (typeof actor === 'string') {
                tags.push(
                  <meta key={i++} property="video:actor" content={actor} />
                )
              } else {
                if (actor.url) {
                  tags.push(
                    <meta
                      key={i++}
                      property="video:actor"
                      content={String(actor.url)}
                    />
                  )
                }
                if (actor.role) {
                  tags.push(
                    <meta
                      key={i++}
                      property="video:actor:role"
                      content={actor.role}
                    />
                  )
                }
              }
            }
          }
          if (og.directors) {
            for (const director of og.directors) {
              tags.push(
                <meta
                  key={i++}
                  property="video:director"
                  content={String(director)}
                />
              )
            }
          }
          if (og.writers) {
            for (const writer of og.writers) {
              tags.push(
                <meta
                  key={i++}
                  property="video:writer"
                  content={String(writer)}
                />
              )
            }
          }
          if (og.duration != null) {
            tags.push(
              <meta
                key={i++}
                property="video:duration"
                content={String(og.duration)}
              />
            )
          }
          if (og.releaseDate) {
            tags.push(
              <meta
                key={i++}
                property="video:release_date"
                content={og.releaseDate}
              />
            )
          }
          if (og.tags) {
            for (const tag of og.tags) {
              tags.push(<meta key={i++} property="video:tag" content={tag} />)
            }
          }
          break

        case 'video.episode':
          tags.push(
            <meta key={i++} property="og:type" content="video.episode" />
          )
          if (og.actors) {
            for (const actor of og.actors) {
              if (typeof actor === 'string') {
                tags.push(
                  <meta key={i++} property="video:actor" content={actor} />
                )
              } else {
                if (actor.url) {
                  tags.push(
                    <meta
                      key={i++}
                      property="video:actor"
                      content={String(actor.url)}
                    />
                  )
                }
                if (actor.role) {
                  tags.push(
                    <meta
                      key={i++}
                      property="video:actor:role"
                      content={actor.role}
                    />
                  )
                }
              }
            }
          }
          if (og.directors) {
            for (const director of og.directors) {
              tags.push(
                <meta
                  key={i++}
                  property="video:director"
                  content={String(director)}
                />
              )
            }
          }
          if (og.writers) {
            for (const writer of og.writers) {
              tags.push(
                <meta
                  key={i++}
                  property="video:writer"
                  content={String(writer)}
                />
              )
            }
          }
          if (og.duration != null) {
            tags.push(
              <meta
                key={i++}
                property="video:duration"
                content={String(og.duration)}
              />
            )
          }
          if (og.releaseDate) {
            tags.push(
              <meta
                key={i++}
                property="video:release_date"
                content={og.releaseDate}
              />
            )
          }
          if (og.tags) {
            for (const tag of og.tags) {
              tags.push(<meta key={i++} property="video:tag" content={tag} />)
            }
          }
          if (og.series) {
            tags.push(
              <meta
                key={i++}
                property="video:series"
                content={String(og.series)}
              />
            )
          }
          break

        case 'video.tv_show':
          tags.push(
            <meta key={i++} property="og:type" content="video.tv_show" />
          )
          break

        case 'video.other':
          tags.push(<meta key={i++} property="og:type" content="video.other" />)
          break

        default:
          const _exhaustiveCheck: never = ogType
          throw new Error(`Invalid OpenGraph type: ${_exhaustiveCheck}`)
      }
    }
  }

  // --- Twitter ---
  if (metadata.twitter) {
    const tw = metadata.twitter
    const { card } = tw

    if (card) {
      tags.push(<meta key={i++} name="twitter:card" content={card} />)
    }
    if (tw.site) {
      tags.push(<meta key={i++} name="twitter:site" content={tw.site} />)
    }
    if (tw.siteId) {
      tags.push(<meta key={i++} name="twitter:site:id" content={tw.siteId} />)
    }
    if (tw.creator) {
      tags.push(<meta key={i++} name="twitter:creator" content={tw.creator} />)
    }
    if (tw.creatorId) {
      tags.push(
        <meta key={i++} name="twitter:creator:id" content={tw.creatorId} />
      )
    }
    if (tw.title?.absolute) {
      tags.push(
        <meta key={i++} name="twitter:title" content={tw.title.absolute} />
      )
    }
    if (tw.description) {
      tags.push(
        <meta key={i++} name="twitter:description" content={tw.description} />
      )
    }

    // Twitter images
    if (tw.images) {
      for (const image of tw.images) {
        if (typeof image === 'string') {
          tags.push(<meta key={i++} name="twitter:image" content={image} />)
        } else {
          if (image.url) {
            tags.push(
              <meta
                key={i++}
                name="twitter:image"
                content={String(image.url)}
              />
            )
          }
          if (image.alt) {
            tags.push(
              <meta key={i++} name="twitter:image:alt" content={image.alt} />
            )
          }
          if (image.secureUrl) {
            tags.push(
              <meta
                key={i++}
                name="twitter:image:secure_url"
                content={String(image.secureUrl)}
              />
            )
          }
          if (image.type) {
            tags.push(
              <meta key={i++} name="twitter:image:type" content={image.type} />
            )
          }
          if (image.width) {
            tags.push(
              <meta
                key={i++}
                name="twitter:image:width"
                content={String(image.width)}
              />
            )
          }
          if (image.height) {
            tags.push(
              <meta
                key={i++}
                name="twitter:image:height"
                content={String(image.height)}
              />
            )
          }
        }
      }
    }

    // Twitter player cards
    if (card === 'player') {
      for (const player of tw.players) {
        tags.push(
          <meta
            key={i++}
            name="twitter:player"
            content={player.playerUrl.toString()}
          />
        )
        tags.push(
          <meta
            key={i++}
            name="twitter:player:stream"
            content={player.streamUrl.toString()}
          />
        )
        tags.push(
          <meta
            key={i++}
            name="twitter:player:width"
            content={String(player.width)}
          />
        )
        tags.push(
          <meta
            key={i++}
            name="twitter:player:height"
            content={String(player.height)}
          />
        )
      }
    }

    // Twitter app cards
    if (card === 'app') {
      const { app } = tw
      for (const platform of ['iphone', 'ipad', 'googleplay'] as const) {
        if (app.name) {
          tags.push(
            <meta
              key={i++}
              name={`twitter:app:name:${platform}`}
              content={app.name}
            />
          )
        }
        if (app.id[platform]) {
          tags.push(
            <meta
              key={i++}
              name={`twitter:app:id:${platform}`}
              content={String(app.id[platform])}
            />
          )
        }
        if (app.url?.[platform]) {
          tags.push(
            <meta
              key={i++}
              name={`twitter:app:url:${platform}`}
              content={app.url[platform]!.toString()}
            />
          )
        }
      }
    }
  }

  // --- App Links ---
  if (metadata.appLinks) {
    const appLinks = metadata.appLinks

    // iOS / iPhone / iPad (AppLinksApple: url, app_store_id, app_name)
    if (appLinks.ios) {
      for (const item of appLinks.ios) {
        if (item.url) {
          tags.push(
            <meta key={i++} property="al:ios:url" content={String(item.url)} />
          )
        }
        if (item.app_store_id) {
          tags.push(
            <meta
              key={i++}
              property="al:ios:app_store_id"
              content={String(item.app_store_id)}
            />
          )
        }
        if (item.app_name) {
          tags.push(
            <meta
              key={i++}
              property="al:ios:app_name"
              content={item.app_name}
            />
          )
        }
      }
    }
    if (appLinks.iphone) {
      for (const item of appLinks.iphone) {
        if (item.url) {
          tags.push(
            <meta
              key={i++}
              property="al:iphone:url"
              content={String(item.url)}
            />
          )
        }
        if (item.app_store_id) {
          tags.push(
            <meta
              key={i++}
              property="al:iphone:app_store_id"
              content={String(item.app_store_id)}
            />
          )
        }
        if (item.app_name) {
          tags.push(
            <meta
              key={i++}
              property="al:iphone:app_name"
              content={item.app_name}
            />
          )
        }
      }
    }
    if (appLinks.ipad) {
      for (const item of appLinks.ipad) {
        if (item.url) {
          tags.push(
            <meta key={i++} property="al:ipad:url" content={String(item.url)} />
          )
        }
        if (item.app_store_id) {
          tags.push(
            <meta
              key={i++}
              property="al:ipad:app_store_id"
              content={String(item.app_store_id)}
            />
          )
        }
        if (item.app_name) {
          tags.push(
            <meta
              key={i++}
              property="al:ipad:app_name"
              content={item.app_name}
            />
          )
        }
      }
    }

    // Android (AppLinksAndroid: package, url, class, app_name)
    if (appLinks.android) {
      for (const item of appLinks.android) {
        if (item.package) {
          tags.push(
            <meta
              key={i++}
              property="al:android:package"
              content={item.package}
            />
          )
        }
        if (item.url) {
          tags.push(
            <meta
              key={i++}
              property="al:android:url"
              content={String(item.url)}
            />
          )
        }
        if (item.class) {
          tags.push(
            <meta key={i++} property="al:android:class" content={item.class} />
          )
        }
        if (item.app_name) {
          tags.push(
            <meta
              key={i++}
              property="al:android:app_name"
              content={item.app_name}
            />
          )
        }
      }
    }

    // Windows Phone (AppLinksWindows: url, app_id, app_name)
    if (appLinks.windows_phone) {
      for (const item of appLinks.windows_phone) {
        if (item.url) {
          tags.push(
            <meta
              key={i++}
              property="al:windows_phone:url"
              content={String(item.url)}
            />
          )
        }
        if (item.app_id) {
          tags.push(
            <meta
              key={i++}
              property="al:windows_phone:app_id"
              content={item.app_id}
            />
          )
        }
        if (item.app_name) {
          tags.push(
            <meta
              key={i++}
              property="al:windows_phone:app_name"
              content={item.app_name}
            />
          )
        }
      }
    }

    // Windows (AppLinksWindows: url, app_id, app_name)
    if (appLinks.windows) {
      for (const item of appLinks.windows) {
        if (item.url) {
          tags.push(
            <meta
              key={i++}
              property="al:windows:url"
              content={String(item.url)}
            />
          )
        }
        if (item.app_id) {
          tags.push(
            <meta
              key={i++}
              property="al:windows:app_id"
              content={item.app_id}
            />
          )
        }
        if (item.app_name) {
          tags.push(
            <meta
              key={i++}
              property="al:windows:app_name"
              content={item.app_name}
            />
          )
        }
      }
    }

    // Windows Universal (AppLinksWindows: url, app_id, app_name)
    if (appLinks.windows_universal) {
      for (const item of appLinks.windows_universal) {
        if (item.url) {
          tags.push(
            <meta
              key={i++}
              property="al:windows_universal:url"
              content={String(item.url)}
            />
          )
        }
        if (item.app_id) {
          tags.push(
            <meta
              key={i++}
              property="al:windows_universal:app_id"
              content={item.app_id}
            />
          )
        }
        if (item.app_name) {
          tags.push(
            <meta
              key={i++}
              property="al:windows_universal:app_name"
              content={item.app_name}
            />
          )
        }
      }
    }

    // Web (AppLinksWeb: url, should_fallback)
    if (appLinks.web) {
      for (const item of appLinks.web) {
        if (item.url) {
          tags.push(
            <meta key={i++} property="al:web:url" content={String(item.url)} />
          )
        }
        if (item.should_fallback != null) {
          tags.push(
            <meta
              key={i++}
              property="al:web:should_fallback"
              content={String(item.should_fallback)}
            />
          )
        }
      }
    }
  }

  // --- Icons ---
  if (metadata.icons) {
    const { shortcut, icon, apple, other } = metadata.icons
    const hasIcon = Boolean(
      shortcut?.length || icon?.length || apple?.length || other?.length
    )

    if (shortcut) {
      for (const ic of shortcut) {
        const { url, rel, ...props } = ic
        tags.push(
          <link
            key={i++}
            rel={rel || 'shortcut icon'}
            href={url.toString()}
            {...props}
          />
        )
      }
    }
    if (icon) {
      for (const ic of icon) {
        const { url, rel, ...props } = ic
        tags.push(
          <link
            key={i++}
            rel={rel || 'icon'}
            href={url.toString()}
            {...props}
          />
        )
      }
    }
    if (apple) {
      for (const ic of apple) {
        const { url, rel, ...props } = ic
        tags.push(
          <link
            key={i++}
            rel={rel || 'apple-touch-icon'}
            href={url.toString()}
            {...props}
          />
        )
      }
    }
    if (other) {
      for (const ic of other) {
        const { url, rel, ...props } = ic
        tags.push(
          <link
            key={i++}
            rel={rel || 'icon'}
            href={url.toString()}
            {...props}
          />
        )
      }
    }

    if (hasIcon) {
      tags.push(<IconMark key={i++} />)
    }
  }

  return tags
}
