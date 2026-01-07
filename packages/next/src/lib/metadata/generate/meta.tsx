import React from 'react'
import { nonNullable } from '../../non-nullable'

export function Meta({
  name,
  property,
  content,
  media,
}: {
  name?: string
  property?: string
  media?: string
  content: string | number | URL | null | undefined
}): React.ReactElement | null {
  if (typeof content !== 'undefined' && content !== null && content !== '') {
    return (
      <meta
        {...(name ? { name } : { property })}
        {...(media ? { media } : undefined)}
        content={typeof content === 'string' ? content : content.toString()}
      />
    )
  }
  return null
}

export function MetaFilter<T extends {} | {}[]>(
  items: (T | null)[]
): NonNullable<T>[] {
  const acc: NonNullable<T>[] = []
  for (const item of items) {
    if (Array.isArray(item)) {
      acc.push(...item.filter(nonNullable))
    } else if (nonNullable(item)) {
      acc.push(item)
    }
  }
  return acc
}

type ExtendMetaContent = Record<
  string,
  undefined | string | URL | number | boolean | null | undefined
>
type MultiMetaContent =
  | (ExtendMetaContent | string | URL | number)[]
  | null
  | undefined

function camelToSnake(camelCaseStr: string) {
  return camelCaseStr.replace(/([A-Z])/g, function (match) {
    return '_' + match.toLowerCase()
  })
}

const aliasPropPrefixes = new Set([
  'og:image',
  'twitter:image',
  'og:video',
  'og:audio',
])
function getMetaKey(prefix: string, key: string) {
  // Use `twitter:image` and `og:image` instead of `twitter:image:url` and `og:image:url`
  // to be more compatible as it's a more common format.
  // `og:video` & `og:audio` do not have a `:url` suffix alias
  if (aliasPropPrefixes.has(prefix) && key === 'url') {
    return prefix
  }
  if (prefix.startsWith('og:') || prefix.startsWith('twitter:')) {
    key = camelToSnake(key)
  }
  return prefix + ':' + key
}

function ExtendMeta({
  content,
  namePrefix,
  propertyPrefix,
}: {
  content?: ExtendMetaContent
  namePrefix?: string
  propertyPrefix?: string
}) {
  if (!content) return null
  return MetaFilter(
    Object.entries(content).map(([k, v]) => {
      return typeof v === 'undefined'
        ? null
        : Meta({
            ...(propertyPrefix && { property: getMetaKey(propertyPrefix, k) }),
            ...(namePrefix && { name: getMetaKey(namePrefix, k) }),
            content: typeof v === 'string' ? v : v?.toString(),
          })
    })
  )
}

export function MultiMeta({
  propertyPrefix,
  namePrefix,
  contents,
}: {
  propertyPrefix?: string
  namePrefix?: string
  contents?: MultiMetaContent | null
}) {
  if (typeof contents === 'undefined' || contents === null) {
    return null
  }

  return MetaFilter(
    contents.map((content) => {
      if (
        typeof content === 'string' ||
        typeof content === 'number' ||
        content instanceof URL
      ) {
        return Meta({
          ...(propertyPrefix
            ? { property: propertyPrefix }
            : { name: namePrefix }),
          content,
        })
      } else {
        return ExtendMeta({
          namePrefix,
          propertyPrefix,
          content,
        })
      }
    })
  )
}
