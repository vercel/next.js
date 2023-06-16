import React from 'react'

export default function Base({
  content,
  height = null,
  width = null,
  children,
}: {
  content?: string
  height?: number | null
  width?: number | null
  children?: React.ReactElement | React.ReactElement[]
}) {
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
