import React from 'react'
import Image from 'next/future/image'

export default function Page() {
  return (
    <div>
      <p>Invalid width or height</p>

      <Image
        src="/test.jpg"
        width="fill"
        height="fill"
        placeholder="blur"
        blurDataURL="/test.jpg"
      />
    </div>
  )
}
