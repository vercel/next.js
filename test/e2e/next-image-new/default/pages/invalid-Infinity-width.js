import React from 'react'
import Image from 'next/image'

export default function Page() {
  return (
    <div>
      <p>Invalid Infinity width</p>
      <Image src="/test.jpg" width={Infinity} height={300} />
    </div>
  )
}
