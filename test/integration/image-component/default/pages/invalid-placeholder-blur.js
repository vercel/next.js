import React from 'react'
import Image from 'next/image'

const Page = () => {
  return (
    <div>
      <Image id="invalid-placeholder-blur" src="/test.png" placeholder="blur" />
    </div>
  )
}

export default Page
