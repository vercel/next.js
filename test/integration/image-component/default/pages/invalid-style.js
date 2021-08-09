import React from 'react'
import Image from 'next/image'
import img from '../public/test.jpg'

const Page = () => {
  return (
    <div>
      <Image id="invalid-style" src={img} style={{ width: '100%' }} />
    </div>
  )
}

export default Page
