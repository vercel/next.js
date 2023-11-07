'use client'

import React, { useEffect } from 'react'

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
    performance.mark('mark_use_counter', {
      detail: {
        feature: `next-third-parties-${dataNtpc}`,
      },
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
