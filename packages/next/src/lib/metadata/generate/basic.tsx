import type {
  ResolvedMetadata,
  ResolvedViewport,
  Viewport,
} from '../types/metadata-interface'
import type { ViewportLayout } from '../types/extra-types'

import { Meta, MetaFilter, MultiMeta } from './meta'
import { ViewportMetaKeys } from '../constants'
import { getOrigin } from './utils'

// convert viewport object to string for viewport meta tag
function resolveViewportLayout(viewport: Viewport) {
  let resolved: string | null = null

  if (viewport && typeof viewport === 'object') {
    resolved = ''
    for (const viewportKey_ in ViewportMetaKeys) {
      const viewportKey = viewportKey_ as keyof ViewportLayout
      if (viewportKey in viewport) {
        let value = viewport[viewportKey]
        if (typeof value === 'boolean') {
          value = value ? 'yes' : 'no'
        } else if (!value && viewportKey === 'initialScale') {
          value = undefined
        }
        if (value) {
          if (resolved) resolved += ', '
          resolved += `${ViewportMetaKeys[viewportKey]}=${value}`
        }
      }
    }
  }
  return resolved
}

export function ViewportMeta({ viewport }: { viewport: ResolvedViewport }) {
  return MetaFilter([
    <meta charSet="utf-8" />,
    Meta({ name: 'viewport', content: resolveViewportLayout(viewport) }),
    ...(viewport.themeColor
      ? viewport.themeColor.map((themeColor) =>
          Meta({
            name: 'theme-color',
            content: themeColor.color,
            media: themeColor.media,
          })
        )
      : []),
    Meta({ name: 'color-scheme', content: viewport.colorScheme }),
  ])
}

export function BasicMeta({ metadata }: { metadata: ResolvedMetadata }) {
  const manifestOrigin = metadata.manifest
    ? getOrigin(metadata.manifest)
    : undefined

  return MetaFilter([
    metadata.title !== null && metadata.title.absolute ? (
      <title>{metadata.title.absolute}</title>
    ) : null,
    Meta({ name: 'description', content: metadata.description }),
    Meta({ name: 'application-name', content: metadata.applicationName }),
    ...(metadata.authors
      ? metadata.authors.map((author) => [
          author.url ? (
            <link rel="author" href={author.url.toString()} />
          ) : null,
          Meta({ name: 'author', content: author.name }),
        ])
      : []),
    metadata.manifest ? (
      <link
        rel="manifest"
        href={metadata.manifest.toString()}
        // If it's same origin, and it's a preview deployment,
        // including credentials for manifest request.
        crossOrigin={
          !manifestOrigin && process.env.VERCEL_ENV === 'preview'
            ? 'use-credentials'
            : undefined
        }
      />
    ) : null,
    Meta({ name: 'generator', content: metadata.generator }),
    Meta({ name: 'keywords', content: metadata.keywords?.join(',') }),
    Meta({ name: 'referrer', content: metadata.referrer }),
    Meta({ name: 'creator', content: metadata.creator }),
    Meta({ name: 'publisher', content: metadata.publisher }),
    Meta({ name: 'robots', content: metadata.robots?.basic }),
    Meta({ name: 'googlebot', content: metadata.robots?.googleBot }),
    Meta({ name: 'abstract', content: metadata.abstract }),
    ...(metadata.archives
      ? metadata.archives.map((archive) => (
          <link rel="archives" href={archive} />
        ))
      : []),
    ...(metadata.assets
      ? metadata.assets.map((asset) => <link rel="assets" href={asset} />)
      : []),
    ...(metadata.bookmarks
      ? metadata.bookmarks.map((bookmark) => (
          <link rel="bookmarks" href={bookmark} />
        ))
      : []),
    ...(metadata.pagination
      ? [
          metadata.pagination.previous ? (
            <link rel="prev" href={metadata.pagination.previous} />
          ) : null,
          metadata.pagination.next ? (
            <link rel="next" href={metadata.pagination.next} />
          ) : null,
        ]
      : []),
    Meta({ name: 'category', content: metadata.category }),
    Meta({ name: 'classification', content: metadata.classification }),
    ...(metadata.other
      ? Object.entries(metadata.other).map(([name, content]) => {
          if (Array.isArray(content)) {
            return content.map((contentItem) =>
              Meta({ name, content: contentItem })
            )
          } else {
            return Meta({ name, content })
          }
        })
      : []),
  ])
}

export function ItunesMeta({ itunes }: { itunes: ResolvedMetadata['itunes'] }) {
  if (!itunes) return null
  const { appId, appArgument } = itunes
  let content = `app-id=${appId}`
  if (appArgument) {
    content += `, app-argument=${appArgument}`
  }
  return <meta name="apple-itunes-app" content={content} />
}

export function FacebookMeta({
  facebook,
}: {
  facebook: ResolvedMetadata['facebook']
}) {
  if (!facebook) return null

  const { appId, admins } = facebook

  return MetaFilter([
    appId ? <meta property="fb:app_id" content={appId} /> : null,
    ...(admins
      ? admins.map((admin) => <meta property="fb:admins" content={admin} />)
      : []),
  ])
}

export function PinterestMeta({
  pinterest,
}: {
  pinterest: ResolvedMetadata['pinterest']
}) {
  if (!pinterest || pinterest.richPin === undefined) return null

  const { richPin } = pinterest

  return <meta property="pinterest-rich-pin" content={richPin.toString()} />
}

const formatDetectionKeys = [
  'telephone',
  'date',
  'address',
  'email',
  'url',
] as const
export function FormatDetectionMeta({
  formatDetection,
}: {
  formatDetection: ResolvedMetadata['formatDetection']
}) {
  if (!formatDetection) return null
  let content = ''
  for (const key of formatDetectionKeys) {
    if (formatDetection[key] === false) {
      if (content) content += ', '
      content += `${key}=no`
    }
  }
  return content ? <meta name="format-detection" content={content} /> : null
}

export function AppleWebAppMeta({
  appleWebApp,
}: {
  appleWebApp: ResolvedMetadata['appleWebApp']
}) {
  if (!appleWebApp) return null

  const { capable, title, startupImage, statusBarStyle } = appleWebApp

  return MetaFilter([
    capable ? Meta({ name: 'mobile-web-app-capable', content: 'yes' }) : null,
    Meta({ name: 'apple-mobile-web-app-title', content: title }),
    startupImage
      ? startupImage.map((image) => (
          <link
            href={image.url}
            media={image.media}
            rel="apple-touch-startup-image"
          />
        ))
      : null,
    statusBarStyle
      ? Meta({
          name: 'apple-mobile-web-app-status-bar-style',
          content: statusBarStyle,
        })
      : null,
  ])
}

export function VerificationMeta({
  verification,
}: {
  verification: ResolvedMetadata['verification']
}) {
  if (!verification) return null

  return MetaFilter([
    MultiMeta({
      namePrefix: 'google-site-verification',
      contents: verification.google,
    }),
    MultiMeta({ namePrefix: 'y_key', contents: verification.yahoo }),
    MultiMeta({
      namePrefix: 'yandex-verification',
      contents: verification.yandex,
    }),
    MultiMeta({ namePrefix: 'me', contents: verification.me }),
    ...(verification.other
      ? Object.entries(verification.other).map(([key, value]) =>
          MultiMeta({ namePrefix: key, contents: value })
        )
      : []),
  ])
}
