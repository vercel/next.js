import React from 'react'
import Image from 'next/image'

const Page = () => {
  return (
    <div>
      <p>Layout Fill</p>
      <div style={{ position: 'relative', width: '600px', height: '350px' }}>
        <Image id="fill1" src="/wide.png" layout="fill" />
      </div>
      <p>Layout Fill</p>
      <div style={{ position: 'relative', width: '50vw', height: '50vh' }}>
        <Image
          id="fill2"
          src="/wide.png"
          layout="fill"
          objectFit="cover"
          objectPosition="left center"
          sizes="50vw"
        />
      </div>
      <p>Layout Fill</p>
    </div>
  )
}

export default Page
