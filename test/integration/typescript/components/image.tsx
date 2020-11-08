import React from 'react'
import Image, { ImageProps } from 'next/image'

export default () => {
  const props: ImageProps = {
    src: '',
    width: 100,
    height: 100,
  }

  const filledProps: ImageProps = {
    src: '',
    layout: 'fill',
  }

  return (
    <>
      <Image {...props} />
      <Image {...filledProps} />
    </>
  )
}
