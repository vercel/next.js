import React from 'react'
import Image, { ImageProps } from 'next/image'

type ImageCardProps = ImageProps & {
  id: string
  optional?: string
}

/**
 * Example of using the `Image` component in a HOC.
 */
export function ImageCard(props: ImageCardProps) {
  return <Image {...props} width="400" height="400" />
}
