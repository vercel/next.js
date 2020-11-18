import React from 'react'
import Image from 'next/image'

const Page = () => {
  return (
    <div>
      <p>Image Client Side Test</p>
      <Image
        id="basic-image"
        src="foo.jpg"
        loading="eager"
        width={300}
        height={400}
        quality={60}
      />
      <Image
        id="unoptimized-image"
        unoptimized
        src="https://arbitraryurl.com/foo.jpg"
        loading="eager"
        width={300}
        height={400}
      />
    </div>
  )
}

export default Page
