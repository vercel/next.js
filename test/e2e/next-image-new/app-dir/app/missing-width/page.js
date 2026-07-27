import React from 'react'
import Image from 'next/image'

export default function Page() {
  return (
    <div>
      <h1>Missing width or height</h1>
      <Image src="/test.jpg" height={100} />
    </div>
  )
}
