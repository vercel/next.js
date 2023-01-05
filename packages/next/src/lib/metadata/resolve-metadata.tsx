import type {
  Metadata,
  ResolvedMetadata,
  ResolvingMetadata,
} from './types/metadata-interface'

import React from 'react'
import fs from 'fs-extra'
import path from 'path'
import { DEFAULT_METADATA } from './constant'

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
  for (const key_ in source) {
    const key = key_ as keyof Metadata

    if (key === 'other') {
      target.other = Object.assign({}, target.other, source.other)
    } else {
      // TODO: Make sure the type is correct.
      // @ts-ignore
      target[key] = source[key]
    }
  }
}

export async function resolveMetadata(metadataItems: Item[]) {
  // TODO: Use `structuredClone` here.
  let resolvedMetadata: ResolvedMetadata = { ...DEFAULT_METADATA }

  for (const item of metadataItems) {
    if (item.type === 'layout' || item.type === 'page') {
      const layerMod = await item.mod()

      if (layerMod.metadata && layerMod.generateMetadata) {
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
      {metadata.title !== null ? <title>{metadata.title}</title> : null}
      {metadata.description !== null ? (
        <meta name="description" content={metadata.description} />
      ) : null}
    </>
  )
}

export async function resolveFileBaseMetadataForLoader(dir: string) {
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
