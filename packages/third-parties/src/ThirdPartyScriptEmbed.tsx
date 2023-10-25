'use client'

import React from 'react'

export type ScriptEmbed = {
  html?: string | null
  height?: number | null
  width?: number | null
  children?: React.ReactElement | React.ReactElement[]
  dataNtpc?: string
}

export default function ThirdPartyScriptEmbed({
  html,
  height = null,
  width = null,
  children,
  dataNtpc = '',
}: ScriptEmbed) {
  useEffect(() => {
    // Useful for feature detection and measurement
    performance.mark('next-third-parties', {
      type: dataNtpc,
    })
  }, [dataNtpc])

  return (
    <>
      {/* insert script children */}
      {children}
      {/* insert html */}
      {html ? (
        <div
          style={{
            height: height != null ? `${height}px` : 'auto',
            width: width != null ? `${width}px` : 'auto',
          }}
          data-ntpc={dataNtpc}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : null}
    </>
  )
}
