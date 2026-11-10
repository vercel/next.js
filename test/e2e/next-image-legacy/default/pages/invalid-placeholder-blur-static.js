import React from 'react'
import Image from 'next/legacy/image'
import testBMP from '../public/test.bmp'

const Page = () => {
  return (
    <div>
      <Image
        id="invalid-placeholder-blur-static"
        src={testBMP}
        placeholder="blur"
      />
    </div>
  )
}

export default Page
