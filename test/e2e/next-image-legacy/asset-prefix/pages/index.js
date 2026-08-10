import React from 'react'
import Image from 'next/legacy/image'
import img from '../public/test.jpg'

const Page = () => {
  return (
    <div>
      <p>Asset Prefix</p>
      <Image id="test1" src={img} placeholder="blur"></Image>
    </div>
  )
}

export default Page
