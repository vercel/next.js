import type { ResolvedMetadata } from '../types/metadata-interface'

import React from 'react'

export function AlternatesMetadata({
  alternates,
}: {
  alternates: ResolvedMetadata['alternates']
}) {
  if (!alternates) return null
  return (
    <>
      {alternates.canonical ? (
        <link rel="canonical" href={alternates.canonical.toString()} />
      ) : null}
      {alternates.languages
        ? Object.entries(alternates.languages).map(([locale, url]) =>
            url ? (
              <link
                key={locale}
                rel="alternate"
                hrefLang={locale}
                href={url.toString()}
              />
            ) : null
          )
        : null}
      {alternates.media
        ? Object.entries(alternates.media).map(([media, url]) =>
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
      {alternates.types
        ? Object.entries(alternates.types).map(([type, url]) =>
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
