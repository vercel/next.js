'use client'

import image from './image'
import Image from 'next/image'

export default function Component() {
  return (
    <p>
      <Image src={image} alt="hello image 2" />
      hello world
      {typeof window !== 'undefined' ? 'hello client' : 'hello server'}
    </p>
  )
}
