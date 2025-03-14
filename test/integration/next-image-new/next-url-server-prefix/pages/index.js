import React from 'react'
import Image from 'next/image'
import img from '../public/test.jpg'

const Page = () => {
  return (
    <div>
      <p>nextUrlServerPrefix</p>
      <Image id="test1" src={img} placeholder="blur" />
    </div>
  )
}

export default Page
