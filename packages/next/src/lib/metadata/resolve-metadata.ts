import type {
  Metadata,
  ResolvedMetadata,
  ResolvingMetadata,
} from './types/metadata-interface'
import type { AbsoluteTemplateString } from './types/metadata-types'
import type { Viewport } from './types/extra-types'
import { createDefaultMetadata } from './default-metadata'
import { resolveOpenGraph } from './resolve-opengraph'
import { resolveTitle } from './resolve-title'

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
  let updatedStashedTitle: AbsoluteTemplateString = {
    absolute: '',
    template: templateStrings.title,
  }
  let updatedStashedOpenGraphTitle: AbsoluteTemplateString = {
    absolute: '',
    template: templateStrings.openGraph,
  }
  let updatedStashedTwitterTitle: AbsoluteTemplateString = {
    absolute: '',
    template: templateStrings.twitter,
  }

  for (const key_ in source) {
    const key = key_ as keyof Metadata

    switch (key) {
      case 'other': {
        target.other = { ...target.other, ...source.other }
        break
      }
      case 'title': {
        updatedStashedTitle = resolveTitle(templateStrings.title, source.title)
        target.title = updatedStashedTitle
        break
      }
      case 'openGraph': {
        if (typeof source.openGraph !== 'undefined') {
          target.openGraph = {
            ...resolveOpenGraph(source.openGraph),
          }
          if (source.openGraph && 'title' in source.openGraph) {
            updatedStashedOpenGraphTitle = resolveTitle(
              templateStrings.openGraph,
              source.openGraph.title
            )
            target.openGraph.title = updatedStashedOpenGraphTitle
          }
        } else {
          target.openGraph = null
        }
        break
      }
      case 'twitter': {
        if (typeof source.twitter !== 'undefined') {
          target.twitter = { ...source.twitter }
          if (source.twitter && 'title' in source.twitter) {
            updatedStashedTwitterTitle = resolveTitle(
              templateStrings.twitter,
              source.twitter.title
            )
            target.twitter.title = updatedStashedTwitterTitle
          }
        } else {
          target.twitter = null
        }
        break
      }
      case 'viewport': {
        let content: string | null = null
        const { viewport } = source
        if (typeof viewport === 'string') {
          content = viewport
        } else if (viewport) {
          content = ''
          for (const key_ in viewPortKeys) {
            const key = key_ as keyof Viewport
            if (viewport[key]) {
              if (content) content += ', '
              content += `${viewPortKeys[key]}=${viewport[key]}`
            }
          }
        }
        target.viewport = content
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
        const twitterTitle = resolvedMetadata.twitter?.title
        if (
          twitterTitle &&
          typeof twitterTitle !== 'string' &&
          'template' in twitterTitle
        ) {
          committedTwitterTitleTemplate = twitterTitle.template || null
        }

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
