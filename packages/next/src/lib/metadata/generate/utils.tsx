import React from 'react'

export function Meta({
  name,
  property,
  content,
}: {
  name?: string
  property?: string
  content: string | number | URL | null | undefined
}): React.ReactElement | null {
  if (typeof content !== 'undefined' && content !== null) {
    return (
      <meta
        {...(name ? { name } : { property })}
        content={typeof content === 'string' ? content : content.toString()}
      />
    )
  }
  return null
}

export function MultiMeta({
  propertyPrefix,
  namePrefix,
  contents,
}: {
  propertyPrefix?: string
  namePrefix?: string
  contents:
    | (
        | Record<string, undefined | string | URL | number>
        | string
        | URL
        | number
      )[]
    | null
    | undefined
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
            <React.Fragment key={keyPrefix + '_' + index}>
              {Object.entries(content).map(([k, v]) => {
                return typeof v === 'undefined' ? null : (
                  <Meta
                    key={keyPrefix + ':' + k + '_' + index}
                    {...(propertyPrefix
                      ? { property: propertyPrefix + ':' + k }
                      : { name: namePrefix + ':' + k })}
                    content={typeof v === 'string' ? v : v.toString()}
                  />
                )
              })}
            </React.Fragment>
          )
        }
      })}
    </>
  )
}
