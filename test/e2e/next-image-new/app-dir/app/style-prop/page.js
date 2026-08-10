import React from 'react'
import Image from 'next/image'

const Page = () => {
  return (
    <div>
      <h1>Style prop usage and warnings</h1>
      <Image
        id="with-styles"
        src="/test.png"
        width={400}
        height={400}
        style={{ borderRadius: '10px', padding: 10 }}
        loading="eager"
      />
      <Image
        id="with-overlapping-styles"
        src="/test.jpg"
        width={400}
        height={400}
        style={{ width: '10px', borderRadius: '10px', margin: '15px' }}
        loading="eager"
      />
      <Image
        id="without-styles"
        src="/test.webp"
        width={400}
        height={400}
        loading="eager"
      />
    </div>
  )
}

export default Page
