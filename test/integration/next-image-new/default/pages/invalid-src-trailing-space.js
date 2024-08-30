import React from 'react'
import Image from 'next/image'

export default function Page() {
  return (
    <div>
      <h2>Invalid src with trailing space</h2>
      <Image src="/test.png " width={200} height={200} />
    </div>
  )
}
