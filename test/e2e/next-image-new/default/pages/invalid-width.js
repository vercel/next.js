import React from 'react'
import Image from 'next/image'

export default function Page() {
  return (
    <div>
      <p>Invalid width</p>

      <Image src="/test.jpg" width="100%" height={300} />
    </div>
  )
}
