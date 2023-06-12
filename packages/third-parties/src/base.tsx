import React, { useEffect } from 'react'

export default function Base({
  content,
  stylesheets = [],
  height = null,
  width = null,
  children,
}: {
  content?: string
  stylesheets?: string[]
  height?: number | null
  width?: number | null
  children?: React.ReactElement | React.ReactElement[]
}) {
  useEffect(() => {
    const insertStylesheets = () => {
      stylesheets.forEach((stylesheet: string) => {
        var head = document.head
        var link = document.createElement('link')

        link.type = 'text/css'
        link.rel = 'stylesheet'
        link.href = stylesheet

        head.appendChild(link)
      })
    }

    // insert stylesheets
    insertStylesheets()
  }, [stylesheets])

  return (
    <>
      {/* insert script children */}
      {children}
      {/* insert content */}
      {content && (
        <div
          style={{
            height: `${height}px` || 'auto',
            width: `${width}px` || 'auto',
          }}
          dangerouslySetInnerHTML={{ __html: content }}
        />
      )}
    </>
  )
}
