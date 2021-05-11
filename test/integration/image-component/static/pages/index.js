import React from 'react'
import testImg from '../public/foo/test-rect.jpg'
import Image from 'next/image'

const Page = () => {
  return (
    <div>
      <h1 id="page-header">Static Image</h1>
      <Image id="basic-static" src={testImg} layout="fixed" />
      <Image
        id="basic-non-static"
        src="/test-rect.jpg"
        width="400"
        height="300"
        layout="fixed"
      />
    </div>
  )
}

export default Page
