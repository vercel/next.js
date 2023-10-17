import React from 'react'
import Image from 'next/legacy/image'
import img from '../public/test.jpg'

const Page = () => {
  return (
    <div>
      <p>Trailing Slash</p>
      <Image id="test1" src={img} />
    </div>
  )
}

export default Page
