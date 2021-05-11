import React from 'react'
import testImg from '../public/foo/test-rect.jpg'
import Image from 'next/image'

const Page = () => {
  return (
    <div>
      <h1 id="page-header">Static Image</h1>
      <Image id="basic-static" src={testImg} layout="fixed" />
      <div style={{ position: 'relative', width: '50vw', height: '50vh' }}>
        <Image id="fill-static" src={testImg} layout="fill" />
      </div>
    </div>
  )
}

export default Page
