import type {
  Metadata,
  ResolvedMetadata,
  ResolvingMetadata,
} from './types/metadata-interface'
import type { AbsoluteTemplateString } from './types/metadata-types'

import React from 'react'
import fs from 'fs-extra'
import path from 'path'
import { DEFAULT_METADATA } from './constant'
import { Twitter } from './types/twitter-types'

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

function resolveTitleTemplate(template: string, title: string) {
  return template.replace(/%s/g, title)
}

function mergeTitle(stashed: AbsoluteTemplateString, title: Metadata['title']) {
  if (typeof title === 'string') {
    stashed.absolute = resolveTitleTemplate(stashed.template, title)
  } else if (title) {
    if ('default' in title) {
      stashed.absolute = resolveTitleTemplate(stashed.template, title.default)
    }
    if ('absolute' in title) {
      stashed.absolute = resolveTitleTemplate(stashed.template, title.absolute)
    }
    if (title && 'template' in title) {
      stashed.template = title.template
    }
  }
}

function resolveOpenGraph(
  openGraph: Metadata['openGraph']
): ResolvedMetadata['openGraph'] {
  const emails =
    typeof openGraph?.emails === 'string'
      ? [openGraph.emails]
      : openGraph?.emails
  const phoneNumbers =
    typeof openGraph?.phoneNumbers === 'string'
      ? [openGraph.phoneNumbers]
      : openGraph?.phoneNumbers
  const faxNumbers =
    typeof openGraph?.faxNumbers === 'string'
      ? [openGraph.faxNumbers]
      : openGraph?.faxNumbers
  const alternateLocale =
    typeof openGraph?.alternateLocale === 'string'
      ? [openGraph.alternateLocale]
      : openGraph?.alternateLocale
  const images =
    typeof openGraph?.images === 'string'
      ? [openGraph.images]
      : openGraph?.images

  return {
    ...openGraph,
    emails,
    phoneNumbers,
    faxNumbers,
    alternateLocale,
    // @ts-ignore
    images,
    title: undefined,
  }
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
  // const stashedTwitterTitle: AbsoluteTemplateString = target.twitter?.title || {
  //   absolute: '',
  //   template: '%s',
  // }

  for (const key_ in source) {
    const key = key_ as keyof Metadata

    if (key === 'other') {
      target.other = { ...target.other, ...source.other }
    } else if (key === 'title') {
      mergeTitle(stashedTitle, source.title)
      target.title = stashedTitle
    } else if (key === 'openGraph') {
      if (source.openGraph && 'title' in source.openGraph) {
        mergeTitle(stashedOpenGraphTitle, source.openGraph.title)
      }
      if (typeof source.openGraph !== 'undefined') {
        target.openGraph = {
          ...resolveOpenGraph(source.openGraph),
          title: stashedOpenGraphTitle,
        }
      } else {
        target.openGraph = null
      }
      // } else if (key === 'twitter') {
      //   if (source.twitter && 'title' in source.twitter) {
      //     mergeTitle(stashedTwitterTitle, source.twitter.title)
      //   }
      //   if (typeof source.twitter !== 'undefined') {
      //     target.twitter = { ...source.twitter, title: stashedTwitterTitle }
      //   } else {
      //     target.twitter = null
      //   }
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
      {metadata.title !== null ? (
        <title>
          {typeof metadata.title === 'string'
            ? metadata.title
            : metadata.title.absolute}
        </title>
      ) : null}
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
