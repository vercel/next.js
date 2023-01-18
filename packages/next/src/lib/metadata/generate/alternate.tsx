import type { ResolvedMetadata } from '../types/metadata-interface'

import React from 'react'

export function ResolvedAlternatesMetadata({
  metadata,
}: {
  metadata: ResolvedMetadata
}) {
  return (
    <>
      {metadata.alternates.canonical ? (
        <link rel="canonical" href={metadata.alternates.canonical.toString()} />
      ) : null}
      {Object.entries(metadata.alternates.languages).map(([locale, url]) =>
        url ? (
          <link
            key={locale}
            rel="alternate"
            hrefLang={locale}
            href={url.toString()}
          />
        ) : null
      )}
      {metadata.alternates.media
        ? Object.entries(metadata.alternates.media).map(([media, url]) =>
            url ? (
              <link
                key={media}
                rel="alternate"
                media={media}
                href={url.toString()}
              />
            ) : null
          )
        : null}
      {metadata.alternates.types
        ? Object.entries(metadata.alternates.types).map(([type, url]) =>
            url ? (
              <link
                key={type}
                rel="alternate"
                type={type}
                href={url.toString()}
              />
            ) : null
          )
        : null}
    </>
  )
}
