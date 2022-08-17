import type { ImageConfigComplete } from './image-config'
import { createContext } from 'react'
import { imageConfigDefault } from './image-config'

export const ImageConfigContext =
  createContext<ImageConfigComplete>(imageConfigDefault)

if (process.env.NODE_ENV !== 'production') {
  ImageConfigContext.displayName = 'ImageConfigContext'
}
