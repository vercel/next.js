import type {
  Metadata,
  ResolvedMetadata,
  ResolvingMetadata,
} from './types/metadata-interface'
import type { AbsoluteTemplateString } from './types/metadata-types'

import React from 'react'
import fs from 'fs-extra'
import path from 'path'
import { createResolvedMetadata } from './constant'
import { resolveOpenGraph } from './resolve-opengraph'
import { resolveTitle } from './resolve-title'
import { elementsFromResolvedOpenGraph } from './generate/opengraph'
import { elementsFromResolvedBasic } from './generate/basic'
import { elementsFromResolvedAlternates } from './generate/alternate'

type Item = {
  type: 'layout' | 'page'
  mod: () => Promise<{
    metadata?: Metadata
    generateMetadata?: (
      props: any,
      parent: ResolvingMetadata
    ) => Promise<Metadata>
  }>
}

// Merge the source metadata into the resolved target metadata.
function merge(source: Metadata, target: ResolvedMetadata) {
  const stashedTitle: AbsoluteTemplateString = target.title || {
    absolute: '',
    template: '%s',
  }
  const stashedOpenGraphTitle: AbsoluteTemplateString = target.openGraph
    ?.title || {
    absolute: '',
    template: '%s',
  }
  const stashedTwitterTitle: AbsoluteTemplateString = {
    absolute: '',
    template: '%s',
  }

  for (const key_ in source) {
    const key = key_ as keyof Metadata

    if (key === 'other') {
      target.other = { ...target.other, ...source.other }
    } else if (key === 'title') {
      resolveTitle(stashedTitle, source.title)
      target.title = stashedTitle
    } else if (key === 'openGraph') {
      if (source.openGraph && 'title' in source.openGraph) {
        resolveTitle(stashedOpenGraphTitle, source.openGraph.title)
      }
      if (typeof source.openGraph !== 'undefined') {
        target.openGraph = {
          ...resolveOpenGraph(source.openGraph),
          title: stashedOpenGraphTitle,
        }
      } else {
        target.openGraph = null
      }
    } else if (key === 'twitter') {
      if (source.twitter && 'title' in source.twitter) {
        resolveTitle(stashedTwitterTitle, source.twitter.title)
      }
      if (typeof source.twitter !== 'undefined') {
        target.twitter = { ...source.twitter, title: stashedTwitterTitle }
      } else {
        target.twitter = null
      }
    } else {
      // TODO: Make sure the type is correct.
      // @ts-ignore
      target[key] = source[key]
    }
  }
}

export async function resolveMetadata(
  metadataItems: Item[],
  resolveClientMod: (filepath: string) => any
) {
  let resolvedMetadata = createResolvedMetadata()

  for (const item of metadataItems) {
    if (item.type === 'layout' || item.type === 'page') {
      let layerMod = await item.mod()

      // Layer is a client component, we need to resolve it via flight manifest.
      if ('$$typeof' in layerMod) {
        layerMod = resolveClientMod((layerMod as any).filepath)
      }

      if (layerMod.metadata && layerMod.generateMetadata) {
        console.log(layerMod)
        // TODO: Attach error message link and actual filepath.
        throw new Error(
          'It is not allowed to export both `metadata` and `generateMetadata`.'
        )
      }

      if (layerMod.metadata) {
        merge(layerMod.metadata, resolvedMetadata)
      } else if (layerMod.generateMetadata) {
        // TODO: handle `generateMetadata`
      }
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

export async function resolveFileBasedMetadataForLoader(dir: string) {
  let metadataCode = ''

  const files = await fs.readdir(path.normalize(dir))
  for (const file of files) {
    // TODO: Get a full list and filter out directories.
    if (file === 'icon.svg') {
      metadataCode += `{
        type: 'icon',
        path: ${JSON.stringify(path.join(dir, file))},
      },`
    } else if (file === 'icon.jsx') {
      metadataCode += `{
        type: 'icon',
        mod: () => import(/* webpackMode: "eager" */ ${JSON.stringify(
          path.join(dir, file)
        )}),
      },`
    }
  }

  return metadataCode
}
