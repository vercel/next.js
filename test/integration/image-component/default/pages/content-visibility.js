import React from 'react'
import Image from 'next/image'

const Page = () => {
  return (
    <div>
      <p>Content Visibility Page</p>
      <Image
        priority
        id="basic-image"
        src="/test.jpg"
        width="400"
        height="400"
      ></Image>
      <Image
        priority
        id="responsive"
        src="/wide.png"
        width="1200"
        height="700"
        layout="responsive"
      />
      <Image
        priority
        id="fixed"
        src="/wide.png"
        width="1200"
        height="700"
        layout="fixed"
      />
      <div style={{ position: 'relative', width: '600px', height: '350px' }}>
        <Image priority id="fill" src="/wide.png" layout="fill" />
      </div>
    </div>
  )
}

export default Page
