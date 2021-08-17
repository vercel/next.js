import React from 'react'
import Image from 'next/image'
import img from '../public/test.jpg'

const Page = () => {
  return (
    <div style={{ position: 'static' }}>
      <Image layout="fill" src={img} />
    </div>
  )
}

export default Page
