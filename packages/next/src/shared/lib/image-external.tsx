'use turbopack: no side effects'
import type { ImageLoaderProps } from './image-config'
import type { ImageProps, ImageLoader, StaticImageData } from './get-img-props'

export { Image as default } from '../../client/image-component'
export { getImageProps } from './image-external-get-image-props'

export type { ImageProps, ImageLoaderProps, ImageLoader, StaticImageData }
