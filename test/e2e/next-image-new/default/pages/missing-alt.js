import React from 'react'
import Image from 'next/image'
import testJPG from '../public/test.jpg'

export default function Page() {
  return (
    <div>
      <p>Missing alt</p>

      <Image src={testJPG} />
    </div>
  )
}
