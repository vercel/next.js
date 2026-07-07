import React from 'react'
import Image from 'next/legacy/image'

const Page = () => {
  return (
    <div>
      <h1>Style prop usage and warnings</h1>
      <Image
        layout="fixed"
        id="with-styles"
        src="/test.png"
        width={400}
        height={400}
        style={{ borderRadius: '10px', padding: 10 }}
        loading="eager"
      />
      <Image
        layout="intrinsic"
        id="with-overlapping-styles-intrinsic"
        src="/test.jpg"
        width={400}
        height={400}
        style={{ width: '10px', borderRadius: '10px', margin: '15px' }}
        loading="eager"
      />
      <Image
        layout="responsive"
        id="without-styles-responsive"
        src="/test.webp"
        width={400}
        height={400}
        loading="eager"
      />
    </div>
  )
}

export default Page
