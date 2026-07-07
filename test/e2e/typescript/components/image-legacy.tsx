import React from 'react'
import Image, { ImageProps } from 'next/legacy/image'

export default () => {
  const props: ImageProps = {
    alt: 'test-width-height',
    src: '/noop.jpg',
    width: 100,
    height: 100,
  }

  const filledProps: ImageProps = {
    alt: 'test-layout-fill',
    src: '/noop.jpg',
    layout: 'fill',
  }

  return (
    <>
      <Image {...props} />
      <Image {...filledProps} />
    </>
  )
}
