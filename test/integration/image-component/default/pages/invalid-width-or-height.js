import React from 'react'
import Image from 'next/image'

export default function Page() {
  return (
    <div>
      <p>Invalid width or height</p>

      <Image
        src="/test.jpg"
        width="fill"
        height="fill"
        layout="responsive"
        placeholder="blur"
        blurDataURL="/test.jpg"
      />
    </div>
  )
}
