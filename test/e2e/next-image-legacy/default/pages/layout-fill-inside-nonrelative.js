import React from 'react'
import Image from 'next/legacy/image'
import jpg from '../public/test.jpg'
import png from '../public/test.png'
import avif from '../public/test.avif'
import webp from '../public/test.webp'

const Page = () => {
  return (
    <>
      <h1>Layout fill inside non-relative parent</h1>
      <div style={{ position: 'static', width: '200px', height: '200px' }}>
        <Image id="static" layout="fill" priority src={jpg} />
      </div>
      <div style={{ position: 'fixed', width: '200px', height: '200px' }}>
        <Image id="fixed" layout="fill" priority src={png} />
      </div>
      <div style={{ position: 'absolute', width: '200px', height: '200px' }}>
        <Image id="absolute" layout="fill" priority src={avif} />
      </div>
      <div style={{ position: 'relative', width: '200px', height: '200px' }}>
        <Image id="relative" layout="fill" priority src={webp} />
      </div>
      <footer>footer here</footer>
    </>
  )
}

export default Page
