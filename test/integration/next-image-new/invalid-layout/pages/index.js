import React from 'react'
import Image from 'next/image'
import logo from '../public/logo.png'

const Page = () => {
  return (
    <div>
      <h1>Should not use "layout" prop</h1>
      <Image id="invalid-layout" layout="responsive" src={logo} />
    </div>
  )
}

export default Page
