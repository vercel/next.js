import type { ImageLoaderProps } from './image-config'
import type { ImageProps, ImageLoader, StaticImageData } from './get-img-props'

import { getImgProps } from './get-img-props'
import { warnOnce } from './utils/warn-once'
import { Image } from '../../client/image-component'

// This import is replaced by a webpack alias when
// the user has `images.loaderFile` in next.config.js
// but it must remain in this file which is why we
// assign a global so the exported functions below
// can read the global.
;(globalThis as any).__NEXT_IMAGE_LOADER_FUNC =
  require('next/dist/shared/lib/image-loader').default

const unstable_getImgProps = (imgProps: ImageProps) => {
  warnOnce(
    'unstable_getImgProps() is experimental and may change or be removed at any time. Use at your own risk.'
  )
  const { props } = getImgProps(imgProps)
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined) {
      delete props[key as keyof typeof props]
    }
  }
  return { props }
}

export default Image

export {
  ImageProps,
  ImageLoaderProps,
  ImageLoader,
  StaticImageData,
  unstable_getImgProps,
}
