import type { ImageConfigComplete, ImageLoaderProps } from './image-config'
import type { ImageProps, ImageLoader, StaticImageData } from './get-img-props'

import React from 'react'
import { getImgProps } from './get-img-props'
import { warnOnce } from './utils/warn-once'
import { Image } from '../../client/image-component'

// @ts-ignore - This is replaced by webpack alias
import defaultLoader from 'next/dist/shared/lib/image-loader'

// @ts-ignore - This is replaced by webpack alias
import { isServerComponent } from 'next/dist/shared/lib/image-stuff/index'

const unstable_getImgProps = (imgProps: ImageProps) => {
  warnOnce(
    'Warning: unstable_getImgProps() is experimental and may change or be removed at any time. Use at your own risk.'
  )
  const { props } = getImgProps(imgProps, {
    defaultLoader,
    // This is replaced by webpack define plugin
    imgConf: process.env.__NEXT_IMAGE_OPTS as any as ImageConfigComplete,
  })
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined) {
      delete props[key as keyof typeof props]
    }
  }
  return { props }
}

const WrappedImage = (props: Parameters<typeof Image>[0]) => {
  if (process.env.NODE_ENV !== 'production') {
    if (typeof props.loader === 'function') {
      if (isServerComponent) {
        throw new Error(
          `Please add 'use client' to the file with your "loader" function so it can be used with next/image.`
        )
      }
    }
  }
  return <Image {...props} />
}

export default WrappedImage

export {
  ImageProps,
  ImageLoaderProps,
  ImageLoader,
  StaticImageData,
  unstable_getImgProps,
}
