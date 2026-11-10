import React from 'react'
import Image, { ImageProps } from 'next/image'

export default () => {
  const props: ImageProps = {
    alt: 'test-width-height',
    src: '/noop.jpg',
    width: 100,
    height: 100,
  }

  const filledProps: ImageProps = {
    alt: 'test-fill-true',
    src: '/noop.jpg',
    fill: true,
  }

  return (
    <>
      <Image {...props} />
      <Image {...filledProps} />
    </>
  )
}
