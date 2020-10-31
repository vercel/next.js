import React from 'react'
import Image from 'next/image'

const Page = () => {
  return (
    <div>
      <p>Layout Fill</p>
      <div style={{ position: 'relative', width: '600px', height: '350px' }}>
        <Image id="unsized1" src="/wide.png" unsized />
      </div>
      <p>Layout Fill</p>
      <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
        <Image id="unsized2" src="/wide.png" unsized />
      </div>
      <p>Layout Fill</p>
    </div>
  )
}

export default Page
