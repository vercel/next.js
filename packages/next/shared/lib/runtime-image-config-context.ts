import React from 'react'
import {
  ImageConfigComplete,
  imageConfigDefault,
} from '../../server/image-config'

export const ImageConfigContext =
  React.createContext<ImageConfigComplete>(imageConfigDefault)

if (process.env.NODE_ENV !== 'production') {
  ImageConfigContext.displayName = 'ImageConfigContext'
}
