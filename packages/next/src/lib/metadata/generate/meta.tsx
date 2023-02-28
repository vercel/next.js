import React from 'react'

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

type ExtendMetaContent = Record<
  string,
  undefined | string | URL | number | boolean | null | undefined
>
type MultiMetaContent =
  | (ExtendMetaContent | string | URL | number)[]
  | null
  | undefined

function ExtendMeta({
  content,
  namePrefix,
  propertyPrefix,
  mapKey,
}: {
  content?: ExtendMetaContent
  namePrefix?: string
  propertyPrefix?: string
  mapKey: (key: string) => string
}) {
  const keyPrefix = namePrefix || propertyPrefix
  if (!content) return null
  return (
    <React.Fragment>
      {Object.entries(content).map(([k, v], index) => {
        return typeof v === 'undefined' ? null : (
          <Meta
            key={keyPrefix + ':' + k + '_' + index}
            {...(propertyPrefix
              ? { property: mapKey(propertyPrefix + ':' + k) }
              : { name: mapKey(namePrefix + ':' + k) })}
            content={typeof v === 'string' ? v : v?.toString()}
          />
        )
      })}
    </React.Fragment>
  )
}

export function MultiMeta({
  propertyPrefix,
  namePrefix,
  contents,
  mapKey = (key) => key,
}: {
  propertyPrefix?: string
  namePrefix?: string
  contents?: MultiMetaContent | null
  mapKey?: (key: string) => string
}) {
  if (typeof contents === 'undefined' || contents === null) {
    return null
  }

  const keyPrefix = propertyPrefix || namePrefix
  return (
    <>
      {contents.map((content, index) => {
        if (
          typeof content === 'string' ||
          typeof content === 'number' ||
          content instanceof URL
        ) {
          return (
            <Meta
              key={keyPrefix + '_' + index}
              {...(propertyPrefix
                ? { property: propertyPrefix }
                : { name: namePrefix })}
              content={content}
            />
          )
        } else {
          return (
            <ExtendMeta
              key={keyPrefix + '_' + index}
              namePrefix={namePrefix}
              propertyPrefix={propertyPrefix}
              content={content}
              mapKey={mapKey}
            />
          )
        }
      })}
    </>
  )
}
