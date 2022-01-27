import React from 'react'
import {
  ImageConfigComplete,
  imageConfigDefault,
} from '../../server/image-config'

export const RuntimeImageConfigContext =
  React.createContext<ImageConfigComplete>(imageConfigDefault)

if (process.env.NODE_ENV !== 'production') {
  RuntimeImageConfigContext.displayName = 'RuntimeImageConfigContext'
}
