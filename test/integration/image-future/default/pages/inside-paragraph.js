import React from 'react'
import Image from 'next/future/image'
import img from '../public/test.jpg'

const Page = () => {
  return (
    <p>
      <Image id="inside-paragraph" src={img} />
    </p>
  )
}

export default Page
