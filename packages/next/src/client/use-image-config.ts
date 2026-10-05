'use client'

import { useContext } from 'react'
import {
  prepareImageConfig,
  type ImageConfigForRendering,
} from '../shared/lib/image-config'
import { ImageConfigContext } from '../shared/lib/image-config-context.shared-runtime'

// This is replaced by the bundler define plugin.
const configEnv = process.env.__NEXT_IMAGE_OPTS as any as
  | ImageConfigForRendering
  | undefined

export function useImageConfig() {
  const configContext = useContext(ImageConfigContext)
  return prepareImageConfig(configEnv, configContext)
}
