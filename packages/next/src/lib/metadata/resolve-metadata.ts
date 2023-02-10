import type {
  Metadata,
  ResolvedMetadata,
  ResolvingMetadata,
} from './types/metadata-interface'
import type { AbsoluteTemplateString } from './types/metadata-types'
import { createDefaultMetadata } from './default-metadata'
import { resolveOpenGraph, resolveTwitter } from './resolvers/resolve-opengraph'
import { mergeTitle } from './resolvers/resolve-title'
import { resolveAsArrayOrUndefined } from './generate/utils'
import { isClientReference } from '../../build/is-client-reference'
import {
  getLayoutOrPageModule,
  LoaderTree,
} from '../../server/lib/app-dir-module'
import { ComponentsType } from '../../build/webpack/loaders/next-app-loader'
import { interopDefault } from '../interop-default'
import {
  resolveAlternates,
  resolveAppleWebApp,
  resolveAppLinks,
  resolveRobots,
  resolveVerification,
  resolveViewport,
} from './resolvers/resolve-basics'
import { resolveIcons } from './resolvers/resolve-icons'
import {
  CollectingMetadata,
  MetadataImageModule,
} from '../../build/webpack/loaders/app-dir/types'

// Merge the source metadata into the resolved target metadata.
function merge(
  target: ResolvedMetadata,
  source: Metadata,
  templateStrings: {
    title: string | null
    openGraph: string | null
    twitter: string | null
  }
) {
  const metadataBase = source.metadataBase || null
  for (const key_ in source) {
    const key = key_ as keyof Metadata

    switch (key) {
      case 'title': {
        if (source.title) {
          target.title = source.title as AbsoluteTemplateString
          mergeTitle(target, templateStrings.title)
        }
        break
      }
      case 'alternates': {
        target.alternates = resolveAlternates(source.alternates, metadataBase)
        break
      }
      case 'openGraph': {
        target.openGraph = resolveOpenGraph(source.openGraph, metadataBase)
        if (target.openGraph) {
          mergeTitle(target.openGraph, templateStrings.openGraph)
        }
        break
      }
      case 'twitter': {
        target.twitter = resolveTwitter(source.twitter, metadataBase)
        if (target.twitter) {
          mergeTitle(target.twitter, templateStrings.twitter)
        }
        break
      }
      case 'verification':
        target.verification = resolveVerification(source.verification)
        break
      case 'viewport': {
        target.viewport = resolveViewport(source.viewport)
        break
      }
      case 'icons': {
        target.icons = resolveIcons(source.icons)
        break
      }
      case 'appleWebApp':
        target.appleWebApp = resolveAppleWebApp(source.appleWebApp)
        break
      case 'appLinks':
        target.appLinks = resolveAppLinks(source.appLinks)
        break
      case 'robots': {
        target.robots = resolveRobots(source.robots)
        break
      }
      case 'archives':
      case 'assets':
      case 'bookmarks':
      case 'keywords':
      case 'authors': {
        // FIXME: type inferring
        // @ts-ignore
        target[key] = resolveAsArrayOrUndefined(source[key]) || null
        break
      }
      // directly assign fields that fallback to null
      case 'applicationName':
      case 'description':
      case 'generator':
      case 'themeColor':
      case 'creator':
      case 'publisher':
      case 'category':
      case 'classification':
      case 'referrer':
      case 'colorScheme':
      case 'itunes':
      case 'formatDetection':
        // @ts-ignore TODO: support inferring
        target[key] = source[key] || null
        break
      case 'other':
        target.other = Object.assign({}, target.other, source.other)
        break
      case 'metadataBase':
        target.metadataBase = metadataBase
        break
      default:
        break
    }
  }
}

type MetadataResolver = (
  _parent: ResolvingMetadata
) => Metadata | Promise<Metadata>
export type MetadataItems = [
  Metadata | MetadataResolver | null,
  Metadata | null
][]

async function getDefinedMetadata(
  mod: any,
  props: any
): Promise<Metadata | MetadataResolver | null> {
  // Layer is a client component, we just skip it. It can't have metadata
  // exported. Note that during our SWC transpilation, it should check if
  // the exports are valid and give specific error messages.
  if (isClientReference(mod)) {
    return null
  }

  if (mod.metadata && mod.generateMetadata) {
    throw new Error(
      `${mod.path} is exporting both metadata and generateMetadata which is not supported. If all of the metadata you want to associate to this page/layout is static use the metadata export, otherwise use generateMetadata. File: ${mod.path}`
    )
  }

  return (
    (mod.generateMetadata
      ? (parent: ResolvingMetadata) => mod.generateMetadata(props, parent)
      : mod.metadata) || null
  )
}

async function collectStaticFsBasedIcons(
  metadata: ComponentsType['metadata'],
  type: keyof CollectingMetadata
): Promise<MetadataImageModule | MetadataImageModule[] | undefined> {
  if (!metadata?.[type]) return undefined

  if (type === 'icon' || type === 'apple') {
    const iconPromises = metadata[type].map(
      // TODO-APP: share the typing between next-metadata-image-loader and here
      async (iconResolver) => interopDefault(await iconResolver())
    )
    return iconPromises?.length > 0
      ? await Promise.all(iconPromises)
      : undefined
  } else {
    const imageResolver = metadata[type]
    return imageResolver ? interopDefault(await imageResolver()) : undefined
  }
}

async function resolveStaticMetadata(
  components: ComponentsType
): Promise<Metadata | null> {
  const { metadata } = components
  if (!metadata) return null

  const [icon, apple, opengraph, twitter] = await Promise.all([
    collectStaticFsBasedIcons(metadata, 'icon'),
    collectStaticFsBasedIcons(metadata, 'apple'),
    collectStaticFsBasedIcons(metadata, 'opengraph'),
    collectStaticFsBasedIcons(metadata, 'twitter'),
  ])

  const staticMetadata = {
    icons: {
      icon: [],
      apple: [],
    },
    openGraph: { images: [] },
    twitter: { images: [] },
  }

  // @ts-ignore
  if (icon) staticMetadata.icons.icon = [icon]
  // @ts-ignore
  if (apple) staticMetadata.icons.apple.push(apple)
  if (opengraph) {
    // @ts-ignore
    staticMetadata.openGraph.images.push(opengraph)
  }
  if (twitter) {
    // @ts-ignore
    staticMetadata.twitter.images.push(twitter)
  }

  return staticMetadata
}

// [layout.metadata, static files metadata] -> ... -> [page.metadata, static files metadata]
export async function collectMetadata(
  loaderTree: LoaderTree,
  props: any,
  array: MetadataItems
) {
  const mod = await getLayoutOrPageModule(loaderTree)
  const staticFilesMetadata = await resolveStaticMetadata(loaderTree[2])
  const metadataExport = mod ? await getDefinedMetadata(mod, props) : null

  array.push([metadataExport, staticFilesMetadata])
}

export async function accumulateMetadata(
  metadataItems: MetadataItems
): Promise<ResolvedMetadata> {
  const resolvedMetadata = createDefaultMetadata()
  let parentPromise = Promise.resolve(resolvedMetadata)

  for (const item of metadataItems) {
    const [metadataExport, staticFilesMetadata] = item
    const layerMetadataPromise = Promise.resolve(
      typeof metadataExport === 'function'
        ? metadataExport(parentPromise)
        : metadataExport
    )

    parentPromise = parentPromise.then((resolved) => {
      return layerMetadataPromise.then((exportedMetadata) => {
        const metadata = exportedMetadata || staticFilesMetadata

        if (metadata) {
          // Overriding the metadata if static files metadata is present
          merge(
            resolved,
            // TODO: deep merge metadata
            { ...metadata, ...staticFilesMetadata },
            {
              title: resolved.title?.template || null,
              openGraph: resolved.openGraph?.title?.template || null,
              twitter: resolved.twitter?.title?.template || null,
            }
          )
        }

        return resolved
      })
    })
  }

  return await parentPromise
}
