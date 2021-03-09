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
      <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
        <Image
          id="fill2"
          src="/wide.png"
          layout="fill"
          objectFit="cover"
          objectPosition="left center"
        />
      </div>
      <p>Layout Fill</p>
      <div style={{ position: 'relative', width: '50vw', height: '50vh' }}>
        <Image
          id="fill3"
          src="/wide.png"
          layout="fill"
          objectFit="cover"
          objectPosition="left center"
          sizes="(min-width: 1200px) 90vw, 
                 (min-width: 800px) 30vw,
                 100vw"
        />
      </div>
      <p>Layout Fill</p>
      <div style={{ position: 'relative', width: '50vw', height: '50vh' }}>
        <Image
          id="fill4"
          src="/wide.png"
          layout="fill"
          objectFit="cover"
          objectPosition="left center"
          sizes="500px"
        />
      </div>
    </div>
  )
}

export default Page
