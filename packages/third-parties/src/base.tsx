import React from 'react'

export default function Base({
  content,
  height = null,
  width = null,
  children,
  dataAttr = '',
}: {
  content?: string
  height?: number | null
  width?: number | null
  children?: React.ReactElement | React.ReactElement[]
  dataAttr?: string
}) {
  return (
    <>
      {/* insert script children */}
      {children}
      {/* insert content */}
      {content && (
        <div
          style={{
            height: height != null ? `${height}px` : 'auto',
            width: width != null ? `${width}px` : 'auto',
          }}
          data-ntpc={dataAttr}
          dangerouslySetInnerHTML={{ __html: content }}
        />
      )}
    </>
  )
}
