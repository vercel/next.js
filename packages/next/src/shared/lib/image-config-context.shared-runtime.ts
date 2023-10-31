import React from 'react'
import type { ImageConfigComplete } from './image-config'
import { imageConfigDefault } from './image-config'

export const ImageConfigContext =
  React.createContext<ImageConfigComplete>(imageConfigDefault)

if (process.env.NODE_ENV !== 'production') {
  ImageConfigContext.displayName = 'ImageConfigContext'
}
