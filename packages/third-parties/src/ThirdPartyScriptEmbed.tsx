'use client'

import React, { useEffect } from 'react'

export type ScriptEmbed = {
  html?: string | null
  height?: string | number | null
  width?: string | number | null
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
    if (dataNtpc) {
      // performance.mark is being used as a feature use signal. While it is traditionally used for performance
      // benchmarking it is low overhead and thus considered safe to use in production and it is a widely available
      // existing API.
      performance.mark('mark_feature_usage', {
        detail: {
          feature: `next-third-parties-${dataNtpc}`,
        },
      })
    }
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
