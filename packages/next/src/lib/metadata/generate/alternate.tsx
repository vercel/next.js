import type { ResolvedMetadata } from '../types/metadata-interface'

import React from 'react'
import { AlternateLinkDescriptor } from '../types/alternative-urls-types'

function AlternateLink({
  descriptor,
  ...props
}: {
  descriptor: AlternateLinkDescriptor
} & React.LinkHTMLAttributes<HTMLLinkElement>) {
  if (!descriptor.url) return null
  return (
    <link
      {...props}
      {...(descriptor.title && { title: descriptor.title })}
      href={descriptor.url.toString()}
    />
  )
}

export function AlternatesMetadata({
  alternates,
}: {
  alternates: ResolvedMetadata['alternates']
}) {
  if (!alternates) return null
  const { canonical, languages, media, types } = alternates
  return (
    <>
      {canonical ? (
        <AlternateLink rel="canonical" descriptor={canonical} />
      ) : null}
      {languages
        ? Object.entries(languages).map(([locale, descriptors]) => {
            return descriptors?.map((descriptor, index) => (
              <AlternateLink
                rel="alternate"
                key={index}
                hrefLang={locale}
                descriptor={descriptor}
              />
            ))
          })
        : null}
      {media
        ? Object.entries(media).map(([mediaName, descriptors]) =>
            descriptors?.map((descriptor, index) => (
              <AlternateLink
                rel="alternate"
                key={index}
                media={mediaName}
                descriptor={descriptor}
              />
            ))
          )
        : null}
      {types
        ? Object.entries(types).map(([type, descriptors]) =>
            descriptors?.map((descriptor, index) => (
              <AlternateLink
                rel="alternate"
                key={index}
                type={type}
                descriptor={descriptor}
              />
            ))
          )
        : null}
    </>
  )
}
