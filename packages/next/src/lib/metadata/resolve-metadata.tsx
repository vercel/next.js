import type {
  Metadata,
  ResolvedMetadata,
  ResolvingMetadata,
} from './types/metadata-interface'
import type { AbsoluteTemplateString } from './types/metadata-types'

import React from 'react'
import fs from 'fs-extra'
import path from 'path'
import { createDefaultMetadata } from './constant'
import { resolveOpenGraph } from './resolve-opengraph'
import { resolveTitle } from './resolve-title'
import { elementsFromResolvedOpenGraph } from './generate/opengraph'
import { elementsFromResolvedBasic } from './generate/basic'
import { elementsFromResolvedAlternates } from './generate/alternate'

type Item =
  | {
      type: 'layout' | 'page'
      // A number that represents which layer the item is in. Starting from 0.
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
  source: Metadata,
  target: ResolvedMetadata,
  titles: {
    title: AbsoluteTemplateString
    openGraphTitle: AbsoluteTemplateString
    twitterTitle: AbsoluteTemplateString
  }
) {
  let updatedStashedTitle: AbsoluteTemplateString = titles.title
  let updatedStashedOpenGraphTitle: AbsoluteTemplateString =
    titles.openGraphTitle
  let updatedStashedTwitterTitle: AbsoluteTemplateString = titles.twitterTitle

  for (const key_ in source) {
    const key = key_ as keyof Metadata

    if (key === 'other') {
      target.other = { ...target.other, ...source.other }
    } else if (key === 'title') {
      updatedStashedTitle = resolveTitle(titles.title, source.title)
      target.title = updatedStashedTitle
    } else if (key === 'openGraph') {
      if (typeof source.openGraph !== 'undefined') {
        target.openGraph = {
          ...resolveOpenGraph(source.openGraph),
        }
        if (source.openGraph && 'title' in source.openGraph) {
          updatedStashedOpenGraphTitle = resolveTitle(
            titles.openGraphTitle,
            source.openGraph.title
          )
          target.openGraph.title = updatedStashedOpenGraphTitle
        }
      } else {
        target.openGraph = null
      }
    } else if (key === 'twitter') {
      if (typeof source.twitter !== 'undefined') {
        target.twitter = { ...source.twitter }
        if (source.twitter && 'title' in source.twitter) {
          updatedStashedTwitterTitle = resolveTitle(
            titles.twitterTitle,
            source.twitter.title
          )
          target.twitter.title = updatedStashedTwitterTitle
        }
      } else {
        target.twitter = null
      }
    } else {
      // TODO: Make sure the type is correct.
      // @ts-ignore
      target[key] = source[key]
    }
  }

  return {
    title: updatedStashedTitle,
    openGraphTitle: updatedStashedOpenGraphTitle,
    twitterTitle: updatedStashedTwitterTitle,
  }
}

export async function resolveMetadata(metadataItems: Item[]) {
  const resolvedMetadata = createDefaultMetadata()

  const committedTitle: AbsoluteTemplateString = {
    absolute: '',
    template: '%s',
  }
  const committedOpenGraphTitle: AbsoluteTemplateString = {
    absolute: '',
    template: '%s',
  }
  const committedTwitterTitle: AbsoluteTemplateString = {
    absolute: '',
    template: '%s',
  }
  let stashedTitles

  for (let i = 0; i < metadataItems.length; i++) {
    const item = metadataItems[i]
    if (item.type === 'layout' || item.type === 'page') {
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
          'It is not allowed to export both `metadata` and `generateMetadata`. File: ' +
            item.path
        )
      }

      if (layerMod.metadata) {
        stashedTitles = merge(layerMod.metadata, resolvedMetadata, {
          title: committedTitle,
          openGraphTitle: committedOpenGraphTitle,
          twitterTitle: committedTwitterTitle,
        })
      } else if (layerMod.generateMetadata) {
        stashedTitles = merge(
          await layerMod.generateMetadata(
            // TODO: Rewrite this to pass correct params and resolving metadata value.
            {},
            Promise.resolve(resolvedMetadata)
          ),
          resolvedMetadata,
          {
            title: committedTitle,
            openGraphTitle: committedOpenGraphTitle,
            twitterTitle: committedTwitterTitle,
          }
        )
      }
    }

    // If we resolved all items in this layer, commit the stashed titles.
    if (
      stashedTitles &&
      (i + 1 === metadataItems.length ||
        metadataItems[i + 1].layer !== item.layer)
    ) {
      Object.assign(committedTitle, stashedTitles.title)
      Object.assign(committedOpenGraphTitle, stashedTitles.openGraphTitle)
      Object.assign(committedTwitterTitle, stashedTitles.twitterTitle)
    }
  }

  return resolvedMetadata
}

// Generate the acutal React elements from the resolved metadata.
export function elementsFromResolvedMetadata(metadata: ResolvedMetadata) {
  return (
    <>
      {elementsFromResolvedBasic(metadata)}
      {elementsFromResolvedAlternates(metadata)}
      {metadata.openGraph !== null
        ? elementsFromResolvedOpenGraph(metadata.openGraph)
        : null}
    </>
  )
}

// TODO: Implement this function.
export async function resolveFileBasedMetadataForLoader(
  // @ts-ignore
  layer: number,
  // @ts-ignore
  dir: string
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
