import type { ResolvedMetadata } from '../types/metadata-interface'

import React from 'react'
import { Meta } from './meta'

export function ResolvedBasicMetadata({
  metadata,
}: {
  metadata: ResolvedMetadata
}) {
  return (
    <>
      <meta charSet="utf-8" />
      {metadata.title !== null ? (
        <title>{metadata.title.absolute}</title>
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
      <Meta name="abstract" content={metadata.abstract} />
      {metadata.archives
        ? metadata.archives.map((archive) => (
            <link rel="archives" href={archive} key={archive} />
          ))
        : null}
      {metadata.assets
        ? metadata.assets.map((asset) => (
            <link rel="assets" href={asset} key={asset} />
          ))
        : null}
      {metadata.bookmarks
        ? metadata.bookmarks.map((bookmark) => (
            <link rel="bookmarks" href={bookmark} key={bookmark} />
          ))
        : null}
      <Meta name="category" content={metadata.category} />
      <Meta name="classification" content={metadata.classification} />
      {Object.entries(metadata.other).map(([name, content]) => (
        <Meta
          key={name}
          name={name}
          content={Array.isArray(content) ? content.join(',') : content}
        />
      ))}
    </>
  )
}
