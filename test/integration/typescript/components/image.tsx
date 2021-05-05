import React from 'react'
import Image, { ImageProps } from 'next/image'

export default () => {
  const props: ImageProps = {
    src: '/noop.jpg',
    width: 100,
    height: 100,
  }

  const filledProps: ImageProps = {
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
