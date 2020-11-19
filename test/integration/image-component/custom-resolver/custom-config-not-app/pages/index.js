import React from 'react'
import Image from 'next/image'

const Page = () => {
  return (
    <div>
      <p>Test - Custom resolver specified in config but not _app</p>
      <Image
        id="basic-image"
        src="foo.jpg"
        loading="eager"
        width={300}
        height={400}
        quality={60}
      />
    </div>
  )
}

export default Page
