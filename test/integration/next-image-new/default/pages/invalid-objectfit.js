import React from 'react'
import Image from 'next/image'

const Page = () => {
  return (
    <div>
      <Image
        src="/test.jpg"
        width="400"
        height="400"
        objectFit="contain"
        objectPosition="20% 20%"
      />
    </div>
  )
}

export default Page
