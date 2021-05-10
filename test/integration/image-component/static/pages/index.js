import React from 'react'
import testImg from '../public/foo/test.jpg'
import Image from 'next/image'

const Page = () => {
  return (
    <div>
      <h1 id="page-header">Static Image</h1>
      <Image id="basic-static" src={testImg} />
    </div>
  )
}

export default Page
