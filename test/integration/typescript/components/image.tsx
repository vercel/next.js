import React from 'react'
import Image, { ImageProps } from 'next/image'

export default () => {
  const imageProps: ImageProps = {
    src: '',
    width: 100,
    height: 100,
    unsized: false,
  }

  const unsizedImageProps: ImageProps = {
    src: '',
    unsized: true,
  }

  return (
    <>
      <Image {...imageProps} />
      <Image {...unsizedImageProps} />
    </>
  )
}
