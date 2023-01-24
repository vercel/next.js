import type {
  Metadata,
  ResolvedMetadata,
  ResolvingMetadata,
} from './types/metadata-interface'
import type { Viewport } from './types/extra-types'
import type { ResolvedTwitterMetadata } from './types/twitter-types'
import type {
  AbsoluteTemplateString,
  Icon,
  IconDescriptor,
  Icons,
} from './types/metadata-types'
import { createDefaultMetadata } from './default-metadata'
import { resolveOpenGraph } from './resolve-opengraph'
import { mergeTitle } from './resolve-title'
import { resolveAsArrayOrUndefined } from './generate/utils'

const viewPortKeys = {
  width: 'width',
  height: 'height',
  initialScale: 'initial-scale',
  minimumScale: 'minimum-scale',
  maximumScale: 'maximum-scale',
  viewportFit: 'viewport-fit',
} as const

type Item =
  | {
      type: 'layout' | 'page'
      // A number that represents which layer or routes that the item is in. Starting from 0.
      // Layout and page in the same level will share the same `layer`.
      layer: number
      mod: () => Promise<{
        metadata?: Metadata
        generateMetadata?: (
          props: any,
          parent: ResolvingMetadata
        ) => Promise<Metadata>
      }>
      path: string
    }
  | {
      type: 'icon'
      // A number that represents which layer the item is in. Starting from 0.
      layer: number
      mod?: () => Promise<{
        metadata?: Metadata
        generateMetadata?: (
          props: any,
          parent: ResolvingMetadata
        ) => Promise<Metadata>
      }>
      path?: string
    }

function resolveViewport(
  viewport: Metadata['viewport']
): ResolvedMetadata['viewport'] {
  let resolved: ResolvedMetadata['viewport'] = null

  if (typeof viewport === 'string') {
    resolved = viewport
  } else if (viewport) {
    resolved = ''
    for (const viewportKey_ in viewPortKeys) {
      const viewportKey = viewportKey_ as keyof Viewport
      if (viewport[viewportKey]) {
        if (resolved) resolved += ', '
        resolved += `${viewPortKeys[viewportKey]}=${viewport[viewportKey]}`
      }
    }
  }
  return resolved
}

function isUrlIcon(icon: any): icon is string | URL {
  return typeof icon === 'string' || icon instanceof URL
}

function resolveIcon(icon: Icon): IconDescriptor {
  if (isUrlIcon(icon)) return { url: icon }
  else if (Array.isArray(icon)) return icon
  return icon
}

const IconKeys = ['icon', 'shortcut', 'apple', 'other'] as (keyof Icons)[]

function resolveIcons(icons: Metadata['icons']): ResolvedMetadata['icons'] {
  if (!icons) {
    return null
  }

  const resolved: ResolvedMetadata['icons'] = {}
  if (Array.isArray(icons)) {
    resolved.icon = icons.map(resolveIcon).filter(Boolean)
  } else if (isUrlIcon(icons)) {
    resolved.icon = [resolveIcon(icons)]
  } else {
    for (const key of IconKeys) {
      const values = resolveAsArrayOrUndefined(icons[key])
      if (values) resolved[key] = values.map(resolveIcon)
    }
  }
  return resolved
}

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
  for (const key_ in source) {
    const key = key_ as keyof Metadata

    switch (key) {
      case 'other': {
        Object.assign(target.other, source.other)
        break
      }
      case 'title': {
        if (source.title) {
          target.title = source.title as AbsoluteTemplateString
          mergeTitle(target, templateStrings.title)
        }
        break
      }
      case 'openGraph': {
        if (typeof source.openGraph !== 'undefined') {
          target.openGraph = resolveOpenGraph(source.openGraph)
          if (source.openGraph) {
            mergeTitle(target.openGraph, templateStrings.openGraph)
          }
        } else {
          target.openGraph = null
        }
        break
      }
      case 'twitter': {
        if (source.twitter) {
          target.twitter = source.twitter as ResolvedTwitterMetadata
          mergeTitle(target.twitter, templateStrings.twitter)
        } else {
          target.twitter = null
        }
        break
      }
      case 'viewport': {
        target.viewport = resolveViewport(source.viewport)
        break
      }
      case 'icons': {
        target.icons = resolveIcons(source.icons)
        break
      }
      default: {
        // TODO: Make sure the type is correct.
        // @ts-ignore
        target[key] = source[key]
        break
      }
    }
  }
}

export async function resolveMetadata(metadataItems: Item[]) {
  const resolvedMetadata = createDefaultMetadata()

  let committedTitleTemplate: string | null = null
  let committedOpenGraphTitleTemplate: string | null = null
  let committedTwitterTitleTemplate: string | null = null

  let lastLayer = 0
  // from root layout to page metadata
  for (let i = 0; i < metadataItems.length; i++) {
    const item = metadataItems[i]
    const isLayout = item.type === 'layout'
    const isPage = item.type === 'page'
    if (isLayout || isPage) {
      let layerMod = await item.mod()

      // Layer is a client component, we just skip it. It can't have metadata
      // exported. Note that during our SWC transpilation, it should check if
      // the exports are valid and give specific error messages.
      if (
        '$$typeof' in layerMod &&
        (layerMod as any).$$typeof === Symbol.for('react.module.reference')
      ) {
        continue
      }

      if (layerMod.metadata && layerMod.generateMetadata) {
        throw new Error(
          `A ${item.type} is exporting both metadata and generateMetadata which is not supported. If all of the metadata you want to associate to this ${item.type} is static use the metadata export, otherwise use generateMetadata. File: ` +
            item.path
        )
      }

      // If we resolved all items in this layer, commit the stashed titles.
      if (item.layer >= lastLayer) {
        committedTitleTemplate = resolvedMetadata.title?.template || null
        committedOpenGraphTitleTemplate =
          resolvedMetadata.openGraph?.title?.template || null
        committedTwitterTitleTemplate =
          resolvedMetadata.twitter?.title?.template || null

        lastLayer = item.layer
      }

      if (layerMod.metadata) {
        merge(resolvedMetadata, layerMod.metadata, {
          title: committedTitleTemplate,
          openGraph: committedOpenGraphTitleTemplate,
          twitter: committedTwitterTitleTemplate,
        })
      } else if (layerMod.generateMetadata) {
        merge(
          resolvedMetadata,
          await layerMod.generateMetadata(
            // TODO: Rewrite this to pass correct params and resolving metadata value.
            {},
            Promise.resolve(resolvedMetadata)
          ),
          {
            title: committedTitleTemplate,
            openGraph: committedOpenGraphTitleTemplate,
            twitter: committedTwitterTitleTemplate,
          }
        )
      }
    }
  }

  return resolvedMetadata
}

// TODO: Implement this function.
export async function resolveFileBasedMetadataForLoader(
  _layer: number,
  _dir: string
) {
  let metadataCode = ''

  // const files = await fs.readdir(path.normalize(dir))
  // for (const file of files) {
  //   // TODO: Get a full list and filter out directories.
  //   if (file === 'icon.svg') {
  //     metadataCode += `{
  //       type: 'icon',
  //       layer: ${layer},
  //       path: ${JSON.stringify(path.join(dir, file))},
  //     },`
  //   } else if (file === 'icon.jsx') {
  //     metadataCode += `{
  //       type: 'icon',
  //       layer: ${layer},
  //       mod: () => import(/* webpackMode: "eager" */ ${JSON.stringify(
  //         path.join(dir, file)
  //       )}),
  //       path: ${JSON.stringify(path.join(dir, file))},
  //     },`
  //   }
  // }

  return metadataCode
}
