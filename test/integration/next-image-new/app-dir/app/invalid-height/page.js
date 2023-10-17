import React from 'react'
import Image from 'next/image'

export default function Page() {
  return (
    <div>
      <p>Invalid height</p>

      <Image src="/test.jpg" width={400} height="50vh" />
    </div>
  )
}
