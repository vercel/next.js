import React from 'react'
import Image from 'next/image'

const Page = () => {
  return (
    <div>
      <p>Invalid Unsized</p>
      <Image id="unsized-image" src="/test.png" unsized />
    </div>
  )
}

export default Page
