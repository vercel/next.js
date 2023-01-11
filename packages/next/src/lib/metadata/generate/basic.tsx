import type { ResolvedMetadata } from '../types/metadata-interface'

import React from 'react'
import { Meta } from './utils'

export function elementsFromResolvedBasic(metadata: ResolvedMetadata) {
  return (
    <>
      {metadata.title !== null ? (
        <title>
          {typeof metadata.title === 'string'
            ? metadata.title
            : metadata.title.absolute}
        </title>
      ) : null}
      {metadata.metadataBase !== null ? (
        <base href={metadata.metadataBase.toString()} />
      ) : null}
      <Meta name="description" content={metadata.description} />
      <Meta name="application-name" content={metadata.applicationName} />
      <Meta name="author" content={metadata.authors?.join(',')} />
      <Meta name="generator" content={metadata.generator} />
      <Meta name="keywords" content={metadata.keywords?.join(',')} />
      <Meta name="referrer" content={metadata.referrer} />
      <Meta name="theme-color" content={metadata.themeColor} />
      <Meta name="color-scheme" content={metadata.colorScheme} />
      <Meta name="viewport" content={metadata.viewport} />
      <Meta name="creator" content={metadata.creator} />
      <Meta name="publisher" content={metadata.publisher} />
      <Meta name="robots" content={metadata.robots} />
    </>
  )
}
