import React from 'react'
import Image from 'next/image'

const Page = () => {
  return (
    <Image
      id="quality-50"
      alt="quality-50"
      src="/test.jpg"
      width="400"
      height="400"
      quality="50"
    />
  )
}

export default Page
