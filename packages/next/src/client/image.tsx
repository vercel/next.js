import type { ImageLoaderProps } from '../shared/lib/image-config'
import type {
  ImageProps,
  ImageLoader,
  StaticImageData,
} from '../shared/lib/get-img-props'

import { getImgProps } from '../shared/lib/get-img-props'
import { warnOnce } from '../shared/lib/utils/warn-once'
import { Image } from './image-component'

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
