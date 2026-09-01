import React from 'react'
import Image from 'next/image'

export default function Page() {
  return (
    <div>
      <h2>Invalid src with leading space</h2>
      <Image src=" /test.jpg" width={200} height={200} />
    </div>
  )
}
