import React from 'react'
import Image from 'next/image'

const Page = () => {
  return (
    <div>
      <p>Layout Fill</p>
      <div style={{ position: 'relative', width: '10vw', height: '10vh' }}>
        <Image id="fill1" src="/wide.png" layout="fill" />
      </div>
      <div
        style={{ position: 'relative', minWidth: '20vw', minHeight: '20vh' }}
      >
        <Image id="fill2" src="/wide.png" layout="fill" />
      </div>
      <p>Layout Fill</p>
    </div>
  )
}

export default Page
