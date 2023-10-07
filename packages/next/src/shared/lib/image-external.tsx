import type { ImageConfigComplete, ImageLoaderProps } from './image-config'
import type { ImageProps, ImageLoader, StaticImageData } from './get-img-props'

import { getImgProps } from './get-img-props'
import { warnOnce } from './utils/warn-once'
import { ClientImage } from '../../client/image-component'
import React from 'react'
import ReactDOM from 'react-dom'

// @ts-ignore - This is replaced by webpack alias
import defaultLoader from 'next/dist/shared/lib/image-loader'

// This is replaced by webpack define plugin
const imgConf = process.env.__NEXT_IMAGE_OPTS as any as ImageConfigComplete

const unstable_getImgProps = (imgProps: ImageProps) => {
  warnOnce(
    'Warning: unstable_getImgProps() is experimental and may change or be removed at any time. Use at your own risk.'
  )
  const { props } = getImgProps(imgProps, { defaultLoader, imgConf })
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined) {
      delete props[key as keyof typeof props]
    }
  }
  return { props }
}

export default function Image(imgProps: ImageProps) {
  if (
    !ReactDOM.preload ||
    imgProps.placeholder ||
    Object.entries(imgProps).some(
      ([key, value]) => key.startsWith('on') || typeof value === 'function'
    )
  ) {
    // TODO: remove preload from client component
    return <ClientImage {...imgProps} />
  } else {
    const { props } = getImgProps(imgProps, { defaultLoader, imgConf })
    return <img {...props} data-nimg="rsc" />
  }
}

export {
  ImageProps,
  ImageLoaderProps,
  ImageLoader,
  StaticImageData,
  unstable_getImgProps,
}
