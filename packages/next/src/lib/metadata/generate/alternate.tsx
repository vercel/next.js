import type { ResolvedMetadata } from '../types/metadata-interface'
import type { AlternateLinkDescriptor } from '../types/alternative-urls-types'

import React from 'react'
import { MetaFilter } from './meta'

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

  return MetaFilter([
    canonical
      ? AlternateLink({ rel: 'canonical', descriptor: canonical })
      : null,
    languages
      ? Object.entries(languages).flatMap(([locale, descriptors]) =>
          descriptors?.map((descriptor) =>
            AlternateLink({ rel: 'alternate', hrefLang: locale, descriptor })
          )
        )
      : null,
    media
      ? Object.entries(media).flatMap(([mediaName, descriptors]) =>
          descriptors?.map((descriptor) =>
            AlternateLink({ rel: 'alternate', media: mediaName, descriptor })
          )
        )
      : null,
    types
      ? Object.entries(types).flatMap(([type, descriptors]) =>
          descriptors?.map((descriptor) =>
            AlternateLink({ rel: 'alternate', type, descriptor })
          )
        )
      : null,
  ])
}
