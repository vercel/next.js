import React from 'react'
import ImageConfig from './image-config.client'
import RootStyleRegistry from './root-style-registry.client'

export default function AppLayout({ children }) {
  return (
    <html>
      <head>
        <title>RSC</title>
      </head>
      <body>
        <ImageConfig>
          <RootStyleRegistry>{children}</RootStyleRegistry>
        </ImageConfig>
      </body>
    </html>
  )
}
