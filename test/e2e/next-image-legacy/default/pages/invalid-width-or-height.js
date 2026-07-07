import React from 'react'
import Image from 'next/legacy/image'

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
