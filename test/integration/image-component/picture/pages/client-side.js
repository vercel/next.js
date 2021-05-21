import React from 'react'
import Image from 'next/image'

const Page = () => {
  return (
    <div>
      <p id="client-side">Image Client Side Test</p>
      <div id="basic-image-wrapper">
        <Image
          id="basic-image"
          src="/foo.jpg"
          loading="eager"
          width={300}
          height={400}
          quality={60}
        />
      </div>
      <div id="unoptimized-image-wrapper">
        <Image
          unoptimized
          src="https://arbitraryurl.com/foo.jpg"
          loading="eager"
          width={300}
          height={400}
        />
      </div>
    </div>
  )
}

export default Page
