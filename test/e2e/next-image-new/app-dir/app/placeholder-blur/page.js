import React from 'react'
import Image from 'next/image'

import testJPG from '../../public/test.jpg'
import testPNG from '../../public/test.png'

const Page = () => {
  return (
    <div id="container">
      <h1>Placeholder Blur</h1>
      <p>Scroll down...</p>
      <div style={{ height: '1000vh' }} />
      <Image id="blur1" placeholder="blur" src={testJPG} />
      <div style={{ height: '1000vh' }} />
      <Image id="blur2" placeholder="blur" src={testPNG} sizes="50vw" />
      <footer>Footer</footer>
    </div>
  )
}

export default Page
