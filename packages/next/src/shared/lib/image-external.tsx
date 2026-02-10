import type { ImageConfigComplete, ImageLoaderProps } from './image-config'
import type { ImageProps, ImageLoader, StaticImageData } from './get-img-props'

import { getImgProps } from './get-img-props'
import { Image } from '../../client/image-component'

// This is replaced by webpack alias
import defaultLoader from 'next/dist/shared/lib/image-loader'

/**
 * For more advanced use cases, you can call `getImageProps()`
 * to get the props that would be passed to the underlying `<img>` element,
 * and instead pass to them to another component, style, canvas, etc.
 *
 * Read more: [Next.js docs: `getImageProps`](https://nextjs.org/docs/app/api-reference/components/image#getimageprops)
 */
export function getImageProps(imgProps: ImageProps) {
  // This is replaced by webpack define plugin.
  // In Jest (no webpack), it is a JSON string set via process.env.
  const imgConf =
    typeof process.env.__NEXT_IMAGE_OPTS === 'string'
      ? (JSON.parse(process.env.__NEXT_IMAGE_OPTS) as ImageConfigComplete)
      : (process.env.__NEXT_IMAGE_OPTS as any as ImageConfigComplete)
  const { props } = getImgProps(imgProps, {
    defaultLoader,
    imgConf,
  })
  // Normally we don't care about undefined props because we pass to JSX,
  // but this exported function could be used by the end user for anything
  // so we delete undefined props to clean it up a little.
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined) {
      delete props[key as keyof typeof props]
    }
  }
  return { props }
}

export default Image

export type { ImageProps, ImageLoaderProps, ImageLoader, StaticImageData }
