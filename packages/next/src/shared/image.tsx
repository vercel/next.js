import type { ImageLoaderProps } from './lib/image-config'
import type {
  ImageProps,
  ImageLoader,
  StaticImageData,
} from './lib/get-img-props'

import { getImgProps } from './lib/get-img-props'
import { warnOnce } from './lib/utils/warn-once'
import { Image } from '../client/image-component'

// @ts-ignore - This is replaced by webpack alias
import defaultLoader from 'next/dist/shared/lib/image-loader'

console.log('shared image import is', defaultLoader)
console.log(
  'shared image require is',
  require('next/dist/shared/lib/image-loader').default
)

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
