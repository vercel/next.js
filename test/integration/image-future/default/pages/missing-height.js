import React from 'react'
import Image from 'next/future/image'

export default function Page() {
  return (
    <div>
      <h1>Missing height</h1>
      <Image src="/test.jpg" width="100" />
    </div>
  )
}
