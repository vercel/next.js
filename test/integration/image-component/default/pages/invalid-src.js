import React from 'react'
import Image from 'next/image'

const Page = () => {
  return (
    <div>
      <p>Hello World</p>
      <Image
        src="https://google.com/test.png"
        dangerouslyUseUnsizedImage
      ></Image>
    </div>
  )
}

export default Page
