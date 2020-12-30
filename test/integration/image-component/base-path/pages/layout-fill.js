import React from 'react'
import Image from 'next/image'

const Page = () => {
  return (
    <div>
      <p>Layout Fill</p>
      <div style={{ position: 'relative', width: '600px', height: '350px' }}>
        <Image id="fill1" src="/docs/wide.png" layout="fill" />
      </div>
      <p>Layout Fill</p>
      <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
        <Image
          id="fill2"
          src="/docs/wide.png"
          layout="fill"
          objectFit="cover"
          objectPosition="left center"
        />
      </div>
      <p>Layout Fill</p>
    </div>
  )
}

export default Page
